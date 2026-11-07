// Corre los E2E contra el stack local real, aislado de los datos de desarrollo:
//
// 1. Genera una base temporal (e2e_<id>), un admin de prueba con contraseña
//    aleatoria y un secreto JWT aleatorio. Nunca usa las credenciales de admin
//    de .env.
// 2. Compila y levanta la API en un puerto libre, contra el MongoDB de
//    docker compose (MONGO_URI de .env) y esa base temporal.
// 3. Levanta el admin con ng serve en otro puerto libre, apuntando a esa API.
// 4. Corre Playwright.
// 5. Siempre, aunque algo falle o se interrumpa: para los procesos y borra la
//    base temporal.
//
// Uso: make e2e (carga .env y levanta MongoDB). Los argumentos extra van a
// playwright test, por ejemplo: make e2e E2E_ARGS="--headed".
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(E2E_DIR, '..');
const API_DIR = join(ROOT, 'services', 'api');
const LOG_DIR = join(E2E_DIR, 'test-results');
const HOST = '127.0.0.1';
const API_READY_MS = 60_000;
const ADMIN_READY_MS = 240_000;

/** Base temporal: solo este patrón se borra al terminar. */
const DB_NAME_PATTERN = /^e2e_[0-9a-f]{12}$/;

const log = (message) => console.log(`e2e: ${message}`);

function fail(message) {
  console.error(`e2e: ${message}`);
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  fail('falta MONGO_URI: corre los E2E con make e2e, que carga .env y levanta MongoDB');
}

/** Un puerto TCP libre en 127.0.0.1. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, timeoutMs, child, name) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} terminó antes de estar listo (código ${child.exitCode}); revisa ${name}.log`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Todavía no escucha.
    }
    await sleep(500);
  }
  throw new Error(`${name} no respondió en ${timeoutMs / 1000} s; revisa ${name}.log`);
}

/** Lanza un proceso en su propio grupo, con la salida a un archivo de log. */
function start(name, command, args, options) {
  const logFile = createWriteStream(join(LOG_DIR, `${name}.log`));
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(logFile);
  child.stderr.pipe(logFile);
  return child;
}

/** Para un proceso y todos sus hijos (ng serve lanza varios). */
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  await Promise.race([exited, sleep(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Ya terminó.
    }
  }
}

/**
 * Borra la base temporal con mongosh dentro del contenedor de docker compose.
 * Las credenciales root se expanden dentro del contenedor y no pasan por aquí.
 */
function dropDatabase(dbName) {
  if (!DB_NAME_PATTERN.test(dbName)) {
    throw new Error(`nombre de base inesperado: ${dbName}`);
  }
  const script = `db.getSiblingDB("${dbName}").dropDatabase().ok`;
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'mongo', 'sh', '-c', `mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --quiet --eval '${script}'`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0 || result.stdout.trim() !== '1') {
    throw new Error(`no se pudo borrar ${dbName}: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

const runId = randomBytes(6).toString('hex');
const dbName = `e2e_${runId}`;
const admin = {
  email: `e2e-${runId}@example.test`,
  // 24 caracteres: dentro del rango de 12 caracteres a 72 bytes.
  password: randomBytes(18).toString('base64url'),
};
const children = [];
let tempDir;
let cleaned = false;

async function cleanup() {
  if (cleaned) {
    return;
  }
  cleaned = true;
  await Promise.all(children.map(stop));
  try {
    dropDatabase(dbName);
    log(`base temporal ${dbName} borrada`);
  } catch (error) {
    console.error(`e2e: ${error.message}. Bórrala a mano: make e2e-clean`);
    process.exitCode = 1;
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    log(`${signal}: limpiando`);
    void cleanup().then(() => process.exit(130));
  });
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  tempDir = mkdtempSync(join(tmpdir(), 'personal-blog-e2e-'));
  const [apiPort, adminPort] = [await freePort(), await freePort()];
  const apiUrl = `http://${HOST}:${apiPort}`;
  const adminUrl = `http://${HOST}:${adminPort}`;

  log(`corrida ${runId}: base ${dbName}, API ${apiUrl}, admin ${adminUrl}`);

  log('compilando la API');
  const apiBinary = join(tempDir, 'api');
  const build = spawnSync('go', ['build', '-o', apiBinary, './cmd/api'], { cwd: API_DIR, stdio: 'inherit' });
  if (build.status !== 0) {
    throw new Error('no compiló la API');
  }

  // El entorno de .env, con lo que la corrida necesita propio. Admin y API en
  // el mismo host (127.0.0.1): la cookie SameSite=Strict exige el mismo site.
  const apiEnv = {
    ...process.env,
    PORT: String(apiPort),
    MONGO_DB_NAME: dbName,
    JWT_SECRET: randomBytes(32).toString('base64'),
    ALLOWED_ORIGINS: adminUrl,
    TRUSTED_PROXIES: '',
    INITIAL_ADMIN_EMAIL: admin.email,
    INITIAL_ADMIN_PASSWORD: admin.password,
    LOG_FORMAT: 'text',
    GIN_MODE: 'release',
  };
  const api = start('api', apiBinary, [], { cwd: API_DIR, env: apiEnv });
  children.push(api);
  await waitFor(`${apiUrl}/ready`, API_READY_MS, api, 'api');
  log('API lista');

  log('levantando el admin (ng serve)');
  const adminServer = start(
    'admin',
    'pnpm',
    ['--filter', '@personal-blog/admin', 'start', '--host', HOST, '--port', String(adminPort), '--define', `ADMIN_API_BASE_URL='${apiUrl}'`],
    { cwd: ROOT, env: { ...process.env, NG_CLI_ANALYTICS: 'false' } },
  );
  children.push(adminServer);
  await waitFor(adminUrl, ADMIN_READY_MS, adminServer, 'admin');
  log('admin listo');

  // Las credenciales del admin de prueba van por el entorno, no por la línea
  // de comandos.
  const playwright = spawnSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
    cwd: E2E_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_ADMIN_URL: adminUrl,
      E2E_API_URL: apiUrl,
      E2E_ADMIN_EMAIL: admin.email,
      E2E_ADMIN_PASSWORD: admin.password,
    },
  });
  return playwright.status ?? 1;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`e2e: ${error.message}`);
} finally {
  await cleanup();
}
process.exit(process.exitCode || code);
