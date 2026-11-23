// Arranque de Chrome headless para check-csp-browser.mjs (BLOG-115).
//
// En el CI, de vez en cuando Chrome no imprime «DevTools listening on …» y el
// paso csp se cortaba a los 15 s sin más dato (7 de 178 corridas de ci entre el 12 y el
// 22 de noviembre de 2026, todas con la salida vacía). No se reproduce en
// local ni con la CPU saturada: es el arranque del navegador en el runner, no
// la página ni la CSP. Por eso el arranque se reintenta, acotado, con un
// perfil nuevo cada vez; cada intento fallido se anota (en GitHub Actions como
// warning con el enlace a su run) para seguir contando cuántas veces pasa.

const DEVTOOLS_LINE = /DevTools listening on (ws:\/\/\S+)/;

/** Intentos de arranque: con uno basta casi siempre; tres acotan el peor caso a ~45 s. */
export const LAUNCH_ATTEMPTS = 3;

/**
 * Termina un proceso hijo propio (por su handle) y espera a que salga. Si no
 * sale con SIGTERM en `graceMs`, le manda SIGKILL: Chrome y Brave headless a
 * veces ignoran SIGTERM y quedaban vivos, huérfanos, después de la prueba.
 */
export async function stop(child, graceMs = 5000) {
  const gone = () => child.exitCode !== null || child.signalCode !== null;
  if (gone()) {
    return;
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  // Los topes no retienen el proceso de Node si el hijo ya salió.
  const wait = (ms) => Promise.race([exited, new Promise((resolve) => setTimeout(resolve, ms).unref())]);
  child.kill();
  await wait(graceMs);
  if (!gone()) {
    child.kill('SIGKILL');
    await wait(2000);
  }
}

/**
 * Espera una línea de la salida de un proceso que cumpla la expresión
 * regular. `label` dice qué se esperaba, para que el error nombre el paso.
 */
export function waitForOutput(child, stream, pattern, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk;
      const match = pattern.exec(output);
      if (match) {
        done();
        resolve(match);
      }
    };
    const onExit = (code) => {
      done();
      reject(new Error(`${label}: el proceso terminó (${code}):\n${output}`));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error(`${label}: sin respuesta en ${timeoutMs} ms${output ? `:\n${output}` : ' (sin salida)'}`));
    }, timeoutMs);
    function done() {
      clearTimeout(timer);
      child[stream].off('data', onData);
      child.off('exit', onExit);
    }
    child[stream].on('data', onData);
    child.on('exit', onExit);
  });
}

/** Enlace al run de GitHub Actions actual, si corre ahí. */
export function runUrl(env = process.env) {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env;
  return server && repo && id ? `${server}/${repo}/actions/runs/${id}` : null;
}

/**
 * Arranca el navegador y devuelve el proceso, su perfil y la URL de DevTools.
 * Si no responde en `timeoutMs`, lo detiene, borra su perfil y vuelve a
 * intentar con uno nuevo, hasta `LAUNCH_ATTEMPTS` veces.
 */
export async function launchBrowser({ spawn, browserPath, makeProfile, removeProfile, timeoutMs, log = console.warn, env = process.env }) {
  for (let attempt = 1; ; attempt++) {
    const profile = makeProfile();
    const child = spawn(
      browserPath,
      ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    try {
      const [, debuggerUrl] = await waitForOutput(child, 'stderr', DEVTOOLS_LINE, timeoutMs, 'arranque de Chrome');
      return { child, profile, debuggerUrl };
    } catch (error) {
      await stop(child);
      removeProfile(profile);
      const url = runUrl(env);
      const message = `intento ${attempt}/${LAUNCH_ATTEMPTS}: ${error.message.split('\n')[0]}${url ? ` (${url})` : ''}`;
      log(env.GITHUB_ACTIONS === 'true' ? `::warning title=check-csp-browser::${message}` : `check-csp-browser: ${message}`);
      if (attempt >= LAUNCH_ATTEMPTS) {
        throw new Error(`Chrome no arrancó en ${LAUNCH_ATTEMPTS} intentos: ${error.message}`);
      }
    }
  }
}
