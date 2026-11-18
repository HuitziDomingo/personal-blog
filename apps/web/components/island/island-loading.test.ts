import { describe, expect, it, vi } from 'vitest';

import {
  IDLE_FALLBACK_MS,
  IDLE_TIMEOUT_MS,
  islandMode,
  type LoadingEnv,
  supportsWebGL,
  VISIBLE_MARGIN,
  whenIdleAndVisible,
} from './island-loading';

describe('islandMode', () => {
  it.each([
    { reducedMotion: false, webgl: true, mode: '3d' },
    { reducedMotion: true, webgl: true, mode: 'static' },
    { reducedMotion: false, webgl: false, mode: 'static' },
    { reducedMotion: true, webgl: false, mode: 'static' },
  ] as const)('reducedMotion=$reducedMotion, webgl=$webgl → $mode', ({ reducedMotion, webgl, mode }) => {
    expect(islandMode({ reducedMotion, webgl })).toBe(mode);
  });
});

describe('supportsWebGL', () => {
  const doc = (getContext: (kind: string) => unknown) =>
    ({ createElement: () => ({ getContext }) }) as unknown as Document;

  it('acepta WebGL2', () => {
    expect(supportsWebGL(doc((kind) => (kind === 'webgl2' ? {} : null)))).toBe(true);
  });

  it('acepta WebGL 1 si no hay WebGL2', () => {
    expect(supportsWebGL(doc((kind) => (kind === 'webgl' ? {} : null)))).toBe(true);
  });

  it('rechaza un navegador sin contexto WebGL', () => {
    expect(supportsWebGL(doc(() => null))).toBe(false);
  });

  it('rechaza si crear el contexto lanza', () => {
    expect(
      supportsWebGL(
        doc(() => {
          throw new Error('bloqueado');
        }),
      ),
    ).toBe(false);
  });
});

/** Entorno falso: el test decide cuándo queda libre el navegador y cuándo se ve la isla. */
function fakeEnv({ idle = true, observer = true } = {}) {
  let idleCallback: (() => void) | undefined;
  let intersect: ((visible: boolean) => void) | undefined;
  const disconnect = vi.fn();
  const observerOptions: IntersectionObserverInit[] = [];

  class FakeObserver {
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      observerOptions.push(options);
      intersect = (visible) => {
        callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      };
    }
    observe = vi.fn();
    disconnect = disconnect;
  }

  const env: LoadingEnv = {
    setTimeout: vi.fn((callback: () => void) => {
      idleCallback = callback;
      return 1;
    }),
    clearTimeout: vi.fn(),
    ...(idle
      ? {
          requestIdleCallback: vi.fn((callback: () => void) => {
            idleCallback = callback;
            return 2;
          }),
          cancelIdleCallback: vi.fn(),
        }
      : {}),
    ...(observer ? { IntersectionObserver: FakeObserver as unknown as typeof IntersectionObserver } : {}),
  };

  return {
    env,
    disconnect,
    observerOptions,
    goIdle: () => {
      idleCallback?.();
    },
    setVisible: (visible: boolean) => {
      intersect?.(visible);
    },
  };
}

const element = {} as Element;

describe('whenIdleAndVisible', () => {
  it('espera a que el navegador quede libre y la isla esté en pantalla', () => {
    const fake = fakeEnv();
    const callback = vi.fn();
    whenIdleAndVisible(element, callback, fake.env);

    expect(fake.env.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS });
    fake.setVisible(true);
    expect(callback).not.toHaveBeenCalled();

    fake.goIdle();
    expect(fake.observerOptions).toEqual([{ rootMargin: VISIBLE_MARGIN }]);
    fake.setVisible(false);
    expect(callback).not.toHaveBeenCalled();

    fake.setVisible(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(fake.disconnect).toHaveBeenCalled();

    fake.setVisible(true);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('sin requestIdleCallback, espera con setTimeout', () => {
    const fake = fakeEnv({ idle: false });
    const callback = vi.fn();
    whenIdleAndVisible(element, callback, fake.env);

    expect(fake.env.setTimeout).toHaveBeenCalledWith(expect.any(Function), IDLE_FALLBACK_MS);
    fake.goIdle();
    fake.setVisible(true);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('sin IntersectionObserver, carga en cuanto el navegador queda libre', () => {
    const fake = fakeEnv({ observer: false });
    const callback = vi.fn();
    whenIdleAndVisible(element, callback, fake.env);

    fake.goIdle();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('al cancelar, no carga y suelta el observer', () => {
    const fake = fakeEnv();
    const callback = vi.fn();
    const cancel = whenIdleAndVisible(element, callback, fake.env);

    fake.goIdle();
    cancel();
    fake.setVisible(true);
    expect(callback).not.toHaveBeenCalled();
    expect(fake.env.cancelIdleCallback).toHaveBeenCalledWith(2);
    expect(fake.disconnect).toHaveBeenCalled();
  });
});
