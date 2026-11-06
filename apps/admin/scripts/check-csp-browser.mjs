// Prueba la CSP del build de producción en un navegador real: sirve dist/ con
// las cabeceras de vercel.json (serve-dist.mjs), abre /login en Chrome o
// Chromium headless y lo controla por el protocolo de DevTools con el WebSocket
// nativo de Node. Solo usa módulos de Node: no agrega dependencias, pero
// necesita un navegador basado en Chromium instalado (o CHROME_PATH).
//
// Comprueba que:
// - el admin arranca: el loader inline con hash corre;
// - un <img onerror> inyectado no se ejecuta (script-src-attr);
// - un link javascript: inyectado no se ejecuta (script-src-elem).
// También informa, sin exigirlo, si corre un <script> inline creado con
// createElement: con 'strict-dynamic' corre, porque lo crea código que ya se
// está ejecutando; una inyección de HTML no puede hacerlo.
//
// Uso: node scripts/check-csp-browser.mjs [directorio del build]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./serve-dist.mjs', import.meta.url));
const PORT = 4310;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 15000;

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
];

function findBrowser() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  return BROWSERS.find((candidate) =>
    candidate.startsWith('/') ? existsSync(candidate) : spawnSync('which', [candidate]).status === 0,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera una línea de la salida de un proceso que cumpla la expresión regular.
function waitForOutput(child, stream, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`sin respuesta en ${TIMEOUT_MS} ms:\n${output}`)), TIMEOUT_MS);
    child[stream].on('data', (chunk) => {
      output += chunk;
      const match = pattern.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    });
    child.on('exit', (code) => reject(new Error(`el proceso terminó (${code}):\n${output}`)));
  });
}

// Cliente mínimo del protocolo de DevTools: un id por mensaje.
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      callback(message);
    }
  });

  return {
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) =>
        pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result))),
      );
    },
    close: () => socket.close(),
  };
}

async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

// Se evalúa en la página: inyecta los dos ataques y junta las violaciones.
const PROBE = `(async () => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e.effectiveDirective + ' ' + e.disposition));
  window.__cspImg = false;
  window.__cspLink = false;
  window.__cspScript = false;
  document.body.insertAdjacentHTML('beforeend', '<img src="/csp-probe.png" onerror="window.__cspImg = true">');
  document.body.insertAdjacentHTML('beforeend', '<a id="csp-probe" href="javascript:window.__cspLink = true">x</a>');
  document.getElementById('csp-probe').click();
  const script = document.createElement('script');
  script.textContent = 'window.__cspScript = true';
  document.body.appendChild(script);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { img: window.__cspImg, link: window.__cspLink, script: window.__cspScript, violations };
})()`;

async function run() {
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('no se encontró Chrome ni Chromium; define CHROME_PATH');
  }

  const profile = mkdtempSync(join(tmpdir(), 'check-csp-browser-'));
  const children = [];
  const cleanup = () => {
    for (const child of children) child.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };

  try {
    const server = spawn(process.execPath, [SERVER, String(PORT), ...process.argv.slice(2)], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(server);
    await waitForOutput(server, 'stdout', /serve-dist: /);

    const browser = spawn(
      browserPath,
      ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    children.push(browser);
    const [, debuggerUrl] = await waitForOutput(browser, 'stderr', /DevTools listening on (ws:\/\/\S+)/);

    const target = await fetch(`${new URL(debuggerUrl).origin.replace('ws:', 'http:')}/json/new?${ORIGIN}/login`, { method: 'PUT' }).then((r) => r.json());
    const page = await connect(target.webSocketDebuggerUrl);

    // El admin arrancó si Angular pintó el formulario de login.
    let booted = false;
    for (const deadline = Date.now() + TIMEOUT_MS; Date.now() < deadline && !booted; await sleep(250)) {
      booted = await evaluate(page, "!!document.querySelector('app-root form')").catch(() => false);
    }
    const hasMeta = await evaluate(page, `!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`);
    const probe = await evaluate(page, PROBE);
    page.close();

    const checks = [
      ['el admin arranca (el loader inline con hash corre)', booted],
      ['index.html trae el <meta> de CSP', hasMeta],
      ['un <img onerror> inyectado no se ejecuta', !probe.img && probe.violations.includes('script-src-attr enforce')],
      ['un link javascript: inyectado no se ejecuta', !probe.link && probe.violations.includes('script-src-elem enforce')],
    ];
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'ok  ' : 'FALLA'} ${name}`);
    }
    console.log(`info  <script> inline creado con createElement: ${probe.script ? "corre ('strict-dynamic')" : 'bloqueado'}`);
    console.log(`violaciones: ${probe.violations.join(', ') || 'ninguna'}`);
    return checks.every(([, ok]) => ok);
  } finally {
    cleanup();
  }
}

run().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    console.error(`check-csp-browser: ${error.message}`);
    process.exit(1);
  },
);
