/**
 * Cuándo y cómo se muestra la isla del hero (BLOG-107), sin three.js: este
 * módulo entra en el JS inicial de la portada, la escena no.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** `static`: solo la imagen fija; `3d`: la escena, cuando toque cargarla. */
export type IslandMode = 'static' | '3d';

export function islandMode({ reducedMotion, webgl }: { reducedMotion: boolean; webgl: boolean }): IslandMode {
  return reducedMotion || !webgl ? 'static' : '3d';
}

/** Si el navegador puede crear un contexto WebGL (WebGL2 o, si no, WebGL 1). */
export function supportsWebGL(doc: Document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Lo que `whenIdleAndVisible` usa de `window`; los tests pasan uno falso. */
export interface LoadingEnv {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
  IntersectionObserver?: typeof IntersectionObserver;
}

/** Margen del IntersectionObserver: empieza a cargar un poco antes de que la isla se vea. */
export const VISIBLE_MARGIN = '200px';
/** Sin `requestIdleCallback` (Safari), espera esto después de hidratar. */
export const IDLE_FALLBACK_MS = 1500;
/** Con `requestIdleCallback`, carga a más tardar a los 4 s aunque el hilo siga ocupado. */
export const IDLE_TIMEOUT_MS = 4000;

/**
 * Llama a `callback` una vez, cuando el navegador quede libre y la isla esté
 * en pantalla (o a menos de `VISIBLE_MARGIN`). Devuelve la función que lo cancela.
 */
export function whenIdleAndVisible(element: Element, callback: () => void, env: LoadingEnv): () => void {
  let done = false;
  let observer: IntersectionObserver | undefined;

  const fire = () => {
    if (!done) {
      done = true;
      callback();
    }
  };

  const onIdle = () => {
    if (done) {
      return;
    }
    if (!env.IntersectionObserver) {
      fire();
      return;
    }
    observer = new env.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          fire();
        }
      },
      { rootMargin: VISIBLE_MARGIN },
    );
    observer.observe(element);
  };

  const { requestIdleCallback, cancelIdleCallback } = env;
  let cancelIdle: () => void;
  if (requestIdleCallback && cancelIdleCallback) {
    const handle = requestIdleCallback(onIdle, { timeout: IDLE_TIMEOUT_MS });
    cancelIdle = () => {
      cancelIdleCallback(handle);
    };
  } else {
    const handle = env.setTimeout(onIdle, IDLE_FALLBACK_MS);
    cancelIdle = () => {
      env.clearTimeout(handle);
    };
  }

  return () => {
    done = true;
    cancelIdle();
    observer?.disconnect();
  };
}

/** El `LoadingEnv` del navegador, con cada función atada a `window`. */
export function browserLoadingEnv(win: Window & typeof globalThis): LoadingEnv {
  return {
    ...('requestIdleCallback' in win
      ? {
          requestIdleCallback: win.requestIdleCallback.bind(win),
          cancelIdleCallback: win.cancelIdleCallback.bind(win),
        }
      : {}),
    setTimeout: (callback, ms) => win.setTimeout(callback, ms),
    clearTimeout: (handle) => {
      win.clearTimeout(handle);
    },
    ...(typeof win.IntersectionObserver === 'function' ? { IntersectionObserver: win.IntersectionObserver } : {}),
  };
}
