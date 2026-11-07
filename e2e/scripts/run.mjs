// Corre los E2E contra el stack local real, aislado de los datos de desarrollo:
//
// 1. Genera una base temporal (e2e_<id>), un admin de prueba con contraseña
//    aleatoria y un secreto JWT aleatorio. De .env solo usa MONGO_URI, que debe
//    apuntar al MongoDB local de docker compose.
// 2. Compila y levanta la API en un puerto libre contra esa base temporal.
// 3. Levanta el admin con ng serve en otro puerto libre, apuntando a esa API.
// 4. Corre Playwright.
// 5. Siempre, aunque algo falle o se interrumpa (Ctrl+C, SIGTERM o cerrar la
//    terminal): para los procesos y borra la base temporal.
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

/**
 * La base se borra con mongosh dentro del contenedor de docker compose. Si
 * MONGO_URI apuntara a otro MongoDB (Atlas, otro mongod), la corrida crearía la
 * base allí y el borrado no la encontraría: solo se acepta el MongoDB local.
 */
const LOCAL_MONGO_HOSTS = new Set(['127.0.0.1:27017', 'localhost:27017']);

/**
 * Variables de .env que los procesos hijos no heredan: configuración y secretos
 * de la API. Cada hijo recibe solo lo que la corrida le pasa a propósito, y lo
 * que no se fija usa los valores por defecto de la API.
 */
const NOT_INHERITED = /^(MONGO_|JWT_SECRET$|INITIAL_ADMIN_|ALLOWED_ORIGINS$|TRUSTED_PROXIES$|RATE_LIMIT_|MAX_BODY_BYTES$|LOG_FORMAT$|GIN_MODE$|PORT$)/;

/** Código de salida al interrumpir, 128 + número de señal. */
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };

const log = (message) => console.log(`e2e: ${message}`);

function fail(message) {
  console.error(`e2e: ${message}`);
  process.exit(1);
}

function checkMongoUri(uri) {
  if (!uri) {
    fail('falta MONGO_URI: corre los E2E con make e2e, que carga .env y levanta MongoDB');
  }
  let hosts;
  try {
    hosts = new URL(uri).host.split(',');
  } catch {
    fail('MONGO_URI no es una URL válida');
  }
  if (!hosts.every((host) => LOCAL_MONGO_HOSTS.has(host))) {
    fail('MONGO_URI no apunta al MongoDB local de docker compose (127.0.0.1:27017): los E2E solo corren contra él');
  }
}

checkMongoUri(process.env.MONGO_URI);

function childEnv(extra = {}) {
  const inherited = Object.entries(process.env).filter(([key]) => !NOT_INHERITED.test(key));
  return { ...Object.fromEntries(inherited), ...extra };
}

/** Puertos TCP libres y distintos en 127.0.0.1: los mantiene abiertos hasta tenerlos todos. */
async function freePorts(count) {
  const servers = [];
  try {
    for (let i = 0; i < count; i++) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, HOST, resolve);
      });
      servers.push(server);
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
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

/** Envía una señal al grupo del proceso (detached) o, si no lo encabeza, solo a él. */
function signalTree(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Ya terminó.
    }
  }
}

/**
 * Para un proceso y todos sus hijos (ng serve lanza varios). Señala al grupo
 * aunque el líder ya haya salido: sus nietos pueden seguir vivos.
 */
async function stop(child) {
  const running = child.exitCode === null && child.signalCode === null;
  const exited = running ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve();
  signalTree(child, 'SIGTERM');
  await Promise.race([exited, sleep(5000)]);
  signalTree(child, 'SIGKILL');
}

/**
 * Borra la base temporal con mongosh dentro del contenedor de docker compose.
 * Las credenciales root se expanden dentro del contenedor y no pasan por aquí.
 * Antes comprueba que la base existe ahí: dropDatabase de una base inexistente
 * también devuelve ok, y ocultaría que la API usó otro MongoDB.
 */
function dropDatabase(dbName) {
  if (!DB_NAME_PATTERN.test(dbName)) {
    throw new Error(`nombre de base inesperado: ${dbName}`);
  }
  const script = `db.adminCommand({ listDatabases: 1, nameOnly: true, filter: { name: "${dbName}" } }).databases.length === 0 ? "missing" : db.getSiblingDB("${dbName}").dropDatabase().ok`;
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'mongo', 'sh', '-c', `mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --quiet --eval '${script}'`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const output = result.stdout.trim();
  if (output === 'missing') {
    throw new Error(`la base ${dbName} no está en el MongoDB de docker compose: ¿la API usó otro MongoDB?`);
  }
  if (result.status !== 0 || output !== '1') {
    throw new Error(`no se pudo borrar ${dbName}: ${result.stderr.trim() || output}`);
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
let cleaning = null;
// La base solo existe si la API llegó a arrancar: crea el admin de prueba.
let apiStarted = false;

/**
 * Limpia una sola vez. Devuelve siempre la misma promesa: si una señal ya la
 * empezó, el finally de main espera a que termine en vez de salir antes de
 * borrar la base.
 */
function cleanup() {
  cleaning ??= doCleanup();
  return cleaning;
}

async function doCleanup() {
  await Promise.all(children.map(stop));
  if (apiStarted) {
    try {
      dropDatabase(dbName);
      log(`base temporal ${dbName} borrada`);
    } catch (error) {
      console.error(`e2e: ${error.message}. Revisa y bórrala a mano: make e2e-clean`);
      process.exitCode = 1;
    }
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

for (const [signal, exitCode] of Object.entries(SIGNAL_EXIT_CODES)) {
  process.once(signal, () => {
    log(`${signal}: limpiando`);
    void cleanup().then(() => process.exit(exitCode));
  });
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  tempDir = mkdtempSync(join(tmpdir(), 'personal-blog-e2e-'));
  const [apiPort, adminPort] = await freePorts(2);
  const apiUrl = `http://${HOST}:${apiPort}`;
  const adminUrl = `http://${HOST}:${adminPort}`;

  log(`corrida ${runId}: base ${dbName}, API ${apiUrl}, admin ${adminUrl}`);

  log('compilando la API');
  const apiBinary = join(tempDir, 'api');
  const build = spawnSync('go', ['build', '-o', apiBinary, './cmd/api'], { cwd: API_DIR, stdio: 'inherit' });
  if (build.status !== 0) {
    throw new Error('no compiló la API');
  }

  // Admin y API en el mismo host (127.0.0.1): la cookie SameSite=Strict exige
  // el mismo site.
  const api = start('api', apiBinary, [], {
    cwd: API_DIR,
    env: childEnv({
      MONGO_URI: process.env.MONGO_URI,
      MONGO_DB_NAME: dbName,
      PORT: String(apiPort),
      JWT_SECRET: randomBytes(32).toString('base64'),
      ALLOWED_ORIGINS: adminUrl,
      INITIAL_ADMIN_EMAIL: admin.email,
      INITIAL_ADMIN_PASSWORD: admin.password,
      LOG_FORMAT: 'text',
      GIN_MODE: 'release',
      // Toda la corrida sale de 127.0.0.1: el navegador y las comprobaciones de
      // la API pública comparten el cupo global, y los preflight de CORS
      // también cuentan. Con la ráfaga de 20 por defecto, el flujo recibe 429.
      // Los límites de login y refresh quedan con sus valores por defecto.
      RATE_LIMIT_GLOBAL_PER_MINUTE: '600',
      RATE_LIMIT_GLOBAL_BURST: '200',
    }),
  });
  children.push(api);
  await waitFor(`${apiUrl}/ready`, API_READY_MS, api, 'api');
  apiStarted = true;
  log('API lista');

  log('levantando el admin (ng serve)');
  const adminServer = start(
    'admin',
    'pnpm',
    ['--filter', '@personal-blog/admin', 'start', '--host', HOST, '--port', String(adminPort), '--define', `ADMIN_API_BASE_URL='${apiUrl}'`],
    { cwd: ROOT, env: childEnv({ NG_CLI_ANALYTICS: 'false' }) },
  );
  children.push(adminServer);
  await waitFor(adminUrl, ADMIN_READY_MS, adminServer, 'admin');
  log('admin listo');

  // Las credenciales del admin de prueba van por el entorno, no por la línea
  // de comandos. spawn y no spawnSync: así una señal se atiende enseguida.
  const playwright = spawn('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
    cwd: E2E_DIR,
    stdio: 'inherit',
    env: childEnv({
      E2E_ADMIN_URL: adminUrl,
      E2E_API_URL: apiUrl,
      E2E_ADMIN_EMAIL: admin.email,
      E2E_ADMIN_PASSWORD: admin.password,
    }),
  });
  children.push(playwright);
  const [exitCode] = await new Promise((resolve) => playwright.once('exit', (...args) => resolve(args)));
  return exitCode ?? 1;
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
