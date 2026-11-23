import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

import { LAUNCH_ATTEMPTS, launchBrowser, runUrl } from './launch-browser.mjs';

/** Un «Chrome» falso: responde con la línea de DevTools o se queda callado. */
function fakeBrowser(responds) {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.signalCode = 'SIGTERM';
    child.emit('exit', null);
  };
  if (responds) {
    setImmediate(() => child.stderr.write('\nDevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n'));
  }
  return child;
}

function setup(script) {
  const spawned = [];
  const removed = [];
  const logs = [];
  let n = 0;
  return {
    spawned,
    removed,
    logs,
    options: {
      spawn: () => {
        const child = fakeBrowser(script[spawned.length] ?? false);
        spawned.push(child);
        return child;
      },
      browserPath: 'chrome',
      makeProfile: () => `perfil-${++n}`,
      removeProfile: (dir) => removed.push(dir),
      timeoutMs: 30,
      log: (line) => logs.push(line),
      env: {},
    },
  };
}

test('si Chrome responde, no reintenta', async () => {
  const { options, spawned, logs } = setup([true]);
  const { debuggerUrl, profile } = await launchBrowser(options);
  assert.equal(debuggerUrl, 'ws://127.0.0.1:9222/devtools/browser/abc');
  assert.equal(profile, 'perfil-1');
  assert.equal(spawned.length, 1);
  assert.deepEqual(logs, []);
});

test('si Chrome no responde, lo detiene, borra su perfil y reintenta con otro', async () => {
  const { options, spawned, removed, logs } = setup([false, true]);
  const { profile } = await launchBrowser(options);
  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].killed, true);
  assert.equal(spawned[1].killed, false);
  assert.deepEqual(removed, ['perfil-1']);
  assert.equal(profile, 'perfil-2');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /intento 1\/3: arranque de Chrome: sin respuesta en 30 ms \(sin salida\)/);
});

test(`se rinde tras ${LAUNCH_ATTEMPTS} intentos, sin dejar procesos ni perfiles`, async () => {
  const { options, spawned, removed } = setup([]);
  await assert.rejects(launchBrowser(options), new RegExp(`no arrancó en ${LAUNCH_ATTEMPTS} intentos`));
  assert.equal(spawned.length, LAUNCH_ATTEMPTS);
  assert.ok(spawned.every((child) => child.killed));
  assert.equal(removed.length, LAUNCH_ATTEMPTS);
});

test('en GitHub Actions cada intento fallido es un warning con el enlace a su run', async () => {
  const { options, logs } = setup([false, true]);
  options.env = { GITHUB_ACTIONS: 'true', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '42' };
  await launchBrowser(options);
  assert.match(logs[0], /^::warning title=check-csp-browser::intento 1\/3: .*\(https:\/\/github\.com\/o\/r\/actions\/runs\/42\)$/);
});

test('runUrl solo existe dentro de Actions', () => {
  assert.equal(runUrl({}), null);
});
