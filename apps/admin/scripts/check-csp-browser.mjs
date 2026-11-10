// Prueba la CSP del build de producción en un navegador real: sirve dist/ con
// las cabeceras de vercel.json (serve-dist.mjs), abre /login en Chrome o
// Chromium headless y lo controla por el protocolo de DevTools con el WebSocket
// nativo de Node. Solo usa módulos de Node: no agrega dependencias, pero
// necesita un navegador basado en Chromium instalado (o CHROME_PATH).
//
// Comprueba que:
// - el admin arranca: el loader inline con hash corre;
// - un <img onerror> inyectado no se ejecuta (script-src-attr);
// - un link javascript: inyectado no se ejecuta (script-src-elem);
// - con el sistema en oscuro, el script de tema de <head> pone la clase dark
//   antes de que exista <body>: corre bajo la CSP, antes que Angular;
// - el editor de posts (Milkdown, ADR-018) carga, con su tema desde la hoja
//   aparte, y se usa sin violar la CSP aplicada: se escribe un título, se abre el menú «/» y un bloque de código
//   con CodeMirror. La API no se toca: DevTools responde /auth/me con un
//   usuario de prueba para pasar el guard.
// También informa, sin exigirlo, si corre un <script> inline creado con
// createElement: con 'strict-dynamic' corre, porque lo crea código que ya se
// está ejecutando; una inyección de HTML no puede hacerlo. Y lista las
// violaciones de la política Report-Only (Trusted Types) que causa el editor.
//
// Uso: node scripts/check-csp-browser.mjs [directorio del build]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./serve-dist.mjs', import.meta.url));
const PORT = 4310;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = 15000;

// El origen de la API que el build de producción llama: el connect-src de
// vercel.json (check-api-base-url comprueba que coincidan).
const VERCEL_JSON = new URL('../vercel.json', import.meta.url);
const API_ORIGIN = (() => {
  const csp = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'))
    .headers.flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy').value;
  return /connect-src\s+(\S+)/.exec(csp)[1].replace(/;$/, '');
})();

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

// Corta una promesa que no responde (por ejemplo, si el renderer se cae), para
// fallar con un mensaje en vez de colgarse hasta el timeout del CI.
function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: sin respuesta en ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Termina un proceso y espera a que salga, con un tope.
function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  return Promise.race([exited, sleep(5000)]);
}

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

// Cliente mínimo del protocolo de DevTools: un id por mensaje, y eventos por
// nombre de método.
async function connect(url) {
  const socket = new WebSocket(url);
  await withTimeout(
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    'conexión con DevTools',
  );

  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!Number.isInteger(message.id)) {
      const listener = listeners.get(message.method);
      if (typeof listener === 'function') {
        listener(message.params);
      }
      return;
    }
    const callback = pending.get(message.id);
    if (typeof callback === 'function') {
      pending.delete(message.id);
      callback(message);
    }
  });

  return {
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return withTimeout(
        new Promise((resolve, reject) =>
          pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result))),
        ),
        method,
      );
    },
    on(method, listener) {
      listeners.set(method, listener);
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

// Se evalúa en la página: corre un solo ataque, que debe poner window.__cspRan
// en true si se ejecuta, y devuelve las violaciones que causó solo él. Cada
// ataque va por separado para que la violación de uno no cuente para otro.
const probe = (attack) => `(async () => {
  const violations = [];
  const record = (e) => violations.push(e.effectiveDirective + ' ' + e.disposition);
  document.addEventListener('securitypolicyviolation', record);
  window.__cspRan = false;
  ${attack}
  await new Promise((resolve) => setTimeout(resolve, 1000));
  document.removeEventListener('securitypolicyviolation', record);
  return { ran: window.__cspRan, violations };
})()`;

const ATTACKS = {
  img: `document.body.insertAdjacentHTML('beforeend', '<img src="/csp-probe.png" onerror="window.__cspRan = true">');`,
  link: `document.body.insertAdjacentHTML('beforeend', '<a id="csp-probe" href="javascript:window.__cspRan = true">x</a>');
  document.getElementById('csp-probe').click();`,
  script: `const script = document.createElement('script');
  script.textContent = 'window.__cspRan = true';
  document.body.appendChild(script);`,
};

// Espera a que la expresión sea verdadera en la página, con un tope.
async function waitUntil(page, expression, timeout = TIMEOUT_MS) {
  for (const deadline = Date.now() + timeout; Date.now() < deadline; await sleep(100)) {
    if (await evaluate(page, expression).catch(() => false)) {
      return true;
    }
  }
  return false;
}

// Teclea carácter por carácter, como un usuario: las reglas de entrada de
// Milkdown («# », «/», «```») se disparan con cada carácter escrito.
async function typeText(page, text) {
  for (const char of text) {
    await page.send('Input.insertText', { text: char });
  }
}

async function press(page, key, code = key) {
  const keyCode = { Enter: 13, Escape: 27 }[key];
  const text = key === 'Enter' ? '\r' : undefined;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
}

const EDITOR = "document.querySelector('.milkdown .ProseMirror[role=textbox]')";
const PREVIEW_H1 = "document.querySelector('app-markdown-editor .preview h1')?.textContent";

// Editor de posts (ADR-018, punto 5): abre /posts/new con un usuario de prueba
// y usa Milkdown. Anota todas las violaciones desde que empieza la carga.
async function checkEditor(page) {
  // DevTools responde las llamadas a la API: /auth/me con un usuario, el resto
  // con 404. Nada sale a la red.
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    const me = new URL(request.url).pathname === '/api/v1/auth/me';
    const body = me ? { id: 'csp', email: 'csp@example.test', role: 'admin' } : { title: 'Not Found', status: 404 };
    page
      .send('Fetch.fulfillRequest', {
        requestId,
        responseCode: me ? 200 : 404,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: ORIGIN },
          { name: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      })
      .catch(() => {});
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${API_ORIGIN}/*` }] });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__violations.push([e.effectiveDirective, e.disposition, e.blockedURI, e.sample].filter(Boolean).join(' ')));`,
  });

  await evaluate(page, 'window.__beforeEditor = true');
  await page.send('Page.navigate', { url: `${ORIGIN}/posts/new` });
  const loaded =
    (await waitUntil(page, 'window.__beforeEditor !== true')) && (await waitUntil(page, `!!${EDITOR}`));

  // El tema llega por un <link> a milkdown-theme.css (inject: false en
  // angular.json): cargó si sus variables ya se aplican al editor.
  const theme =
    loaded &&
    (await evaluate(
      page,
      `!!document.querySelector('link[href="milkdown-theme.css"]')?.sheet &&
      getComputedStyle(document.querySelector('.milkdown')).getPropertyValue('--crepe-color-background').trim() !== ''`,
    ));
  let heading = false;
  let slashMenu = false;
  let codeBlock = false;
  if (loaded) {
    await evaluate(page, `${EDITOR}.focus()`);
    await typeText(page, '# Hola');
    heading =
      (await waitUntil(page, `${EDITOR}.querySelector('h1')?.textContent === 'Hola'`, 3000)) &&
      (await waitUntil(page, `${PREVIEW_H1} === 'Hola'`, 3000));

    await press(page, 'Enter');
    await typeText(page, '/');
    slashMenu = await waitUntil(page, "document.querySelector('.milkdown-slash-menu')?.dataset.show === 'true'", 3000);
    await press(page, 'Escape');
    await evaluate(page, `${EDITOR}.focus()`);

    await press(page, 'Enter');
    await typeText(page, '```js ');
    codeBlock = await waitUntil(page, `!!${EDITOR}.querySelector('.cm-editor')`, 3000);
  }
  // Deja que terminen los efectos diferidos (estilos de CodeMirror, menús).
  await sleep(500);
  const violations = (await evaluate(page, 'window.__violations ?? []')) ?? [];

  return {
    loaded,
    theme,
    heading,
    slashMenu,
    codeBlock,
    enforced: violations.filter((v) => v.includes(' enforce')),
    reported: violations.filter((v) => v.includes(' report')),
  };
}

async function run() {
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('no se encontró Chrome ni Chromium; define CHROME_PATH');
  }

  const profile = mkdtempSync(join(tmpdir(), 'check-csp-browser-'));
  const children = [];
  // Espera a que el navegador salga antes de borrar el perfil: si no, sigue
  // escribiendo en él y rmSync puede fallar y tapar el resultado.
  const cleanup = async () => {
    await Promise.all(children.map(stop));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`check-csp-browser: no se pudo borrar ${profile}: ${error.message}`);
    }
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

    const target = await fetch(`${new URL(debuggerUrl).origin.replace('ws:', 'http:')}/json/new?${ORIGIN}/login`, {
      method: 'PUT',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((r) => r.json());
    const page = await connect(target.webSocketDebuggerUrl);

    // El admin arrancó si Angular pintó el formulario de login.
    const waitForBoot = async () => {
      for (const deadline = Date.now() + TIMEOUT_MS; Date.now() < deadline; await sleep(250)) {
        if (await evaluate(page, "!!document.querySelector('app-root form')").catch(() => false)) {
          return true;
        }
      }
      return false;
    };
    const booted = await waitForBoot();
    const hasMeta = await evaluate(page, `!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`);
    const results = {};
    for (const [name, attack] of Object.entries(ATTACKS)) {
      results[name] = await evaluate(page, probe(attack));
    }

    // Tema sin parpadeo: recarga con el sistema en oscuro y anota si la clase
    // dark llegó a <html> cuando todavía no había <body>, es decir, desde el
    // script inline de <head> y no desde Angular. El observer lo inyecta
    // DevTools, que no pasa por la CSP.
    await page.send('Page.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      // Observa document, que ya existe; <html> todavía no.
      source: `new MutationObserver((records, observer) => {
        if (document.documentElement?.classList.contains('dark')) {
          window.__themeBeforeBody = document.body === null;
          observer.disconnect();
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });`,
    });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    // Marca el documento actual para saber cuándo lo reemplazó la recarga: si
    // no, waitForBoot podría responder con el documento viejo.
    await evaluate(page, 'window.__beforeReload = true');
    await page.send('Page.reload');
    let reloaded = false;
    for (const deadline = Date.now() + TIMEOUT_MS; Date.now() < deadline && !reloaded; await sleep(100)) {
      reloaded = await evaluate(page, 'window.__beforeReload !== true').catch(() => false);
    }
    const rebooted = reloaded && (await waitForBoot());
    const themeBeforeBody = rebooted && (await evaluate(page, 'window.__themeBeforeBody === true'));
    const editor = await checkEditor(page);
    page.close();

    const blocked = ({ ran, violations }, directive) => !ran && violations.includes(`${directive} enforce`);
    const checks = [
      ['el admin arranca (el loader inline con hash corre)', booted],
      ['index.html trae el <meta> de CSP', hasMeta],
      ['un <img onerror> inyectado no se ejecuta', blocked(results.img, 'script-src-attr')],
      ['un link javascript: inyectado no se ejecuta', blocked(results.link, 'script-src-elem')],
      ['el script de tema pone dark antes de <body> (sistema en oscuro)', themeBeforeBody],
      ['el editor de posts carga Milkdown (chunk diferido)', editor.loaded],
      ['el tema del editor carga desde su hoja aparte', editor.theme],
      ['escribir «# Hola» da un título en el editor y en la vista previa', editor.heading],
      ['se abren el menú «/» y un bloque de código con CodeMirror', editor.slashMenu && editor.codeBlock],
      ['el editor no viola la CSP aplicada', editor.loaded && editor.enforced.length === 0],
    ];
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'ok  ' : 'FALLA'} ${name}`);
    }
    console.log(`info  <script> inline creado con createElement: ${results.script.ran ? "corre ('strict-dynamic')" : 'bloqueado'}`);
    for (const [name, { violations }] of Object.entries(results)) {
      console.log(`violaciones (${name}): ${violations.join(', ') || 'ninguna'}`);
    }
    console.log(`violaciones (editor, CSP aplicada): ${[...new Set(editor.enforced)].join(', ') || 'ninguna'}`);
    console.log(`info  violaciones (editor, Report-Only): ${[...new Set(editor.reported)].join(', ') || 'ninguna'}`);
    return checks.every(([, ok]) => ok);
  } finally {
    await cleanup();
  }
}

run().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    console.error(`check-csp-browser: ${error.message}`);
    process.exit(1);
  },
);
