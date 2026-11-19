// @vitest-environment jsdom
import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { system } from '../theme/system';
import { IslandHero } from './island-hero';
import type { IslandSceneProps } from './island-scene';

vi.mock('@/assets/img/isla.webp', () => ({ default: { src: '/isla.webp', width: 960, height: 720 } }));

vi.mock('next/image', () => ({
  default: ({ src, alt, fetchPriority }: { src: { src: string }; alt: string; fetchPriority?: 'high' | 'low' | 'auto' }) => (
    <img src={src.src} alt={alt} fetchPriority={fetchPriority} />
  ),
  getImageProps: ({ src, fetchPriority }: { src: { src: string }; fetchPriority?: 'high' | 'low' | 'auto' }) => ({
    props: { src: src.src, fetchPriority },
  }),
}));

/** La última escena montada: el test llama a sus callbacks en lugar de three.js. */
let scene: IslandSceneProps | undefined;
const sceneMounts = vi.fn();

// next/dynamic sustituido por la escena falsa: así se prueba cuándo se pide el chunk.
vi.mock('next/dynamic', () => ({
  default: () =>
    function FakeScene(props: IslandSceneProps) {
      scene = props;
      sceneMounts();
      return <div data-testid="scene" data-visible={String(props.visible)} />;
    },
}));

const ALT = 'Isla flotante de fantasía';

let reducedMotion = false;
let motionListener: ((event: MediaQueryListEvent) => void) | undefined;
let webgl = true;
let goIdle: (() => void) | undefined;
let intersect: ((visible: boolean) => void) | undefined;

beforeEach(() => {
  reducedMotion = false;
  webgl = true;
  scene = undefined;
  motionListener = undefined;
  goIdle = undefined;
  intersect = undefined;
  sceneMounts.mockClear();

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        motionListener = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
    webgl ? ({} as RenderingContext) : null,
  );
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: () => void) => {
      goIdle = callback;
      return 1;
    }),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = (visible) => {
          callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        };
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHero() {
  return render(
    <ChakraProvider value={system}>
      <IslandHero alt={ALT} controls={{ label: 'l', instructions: 'i', loading: 'Cargando isla 3D' }} />
    </ChakraProvider>,
  );
}

function phase(container: HTMLElement) {
  return container.querySelector('[data-island-phase]')?.getAttribute('data-island-phase');
}

describe('IslandHero: imagen fija', () => {
  it('con prefers-reduced-motion se queda con la imagen y no pide la escena', () => {
    reducedMotion = true;
    const { container } = renderHero();

    expect(screen.getByRole('img', { name: ALT })).toBeTruthy();
    expect(phase(container)).toBe('static');
    expect(screen.queryByRole('status')).toBeNull();
    expect(goIdle).toBeUndefined();
    expect(sceneMounts).not.toHaveBeenCalled();
  });

  it('sin WebGL se queda con la imagen y no pide la escena', () => {
    webgl = false;
    const { container } = renderHero();

    expect(screen.getByRole('img', { name: ALT })).toBeTruthy();
    expect(phase(container)).toBe('static');
    expect(sceneMounts).not.toHaveBeenCalled();
  });

  it('si la escena falla, vuelve a la imagen', () => {
    const { container } = renderHero();
    act(() => {
      goIdle?.();
      intersect?.(true);
    });
    act(() => {
      scene?.onError();
    });

    expect(phase(container)).toBe('static');
    expect(screen.queryByTestId('scene')).toBeNull();
  });

  it('si el sistema activa reduced-motion con la isla cargada, desmonta la escena', () => {
    const { container } = renderHero();
    act(() => {
      goIdle?.();
      intersect?.(true);
    });
    act(() => {
      scene?.onReady();
    });
    act(() => {
      motionListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(phase(container)).toBe('static');
    expect(screen.queryByTestId('scene')).toBeNull();
  });
});

describe('IslandHero: carga diferida', () => {
  it('muestra el spinner y reserva el hueco mientras espera', () => {
    const { container } = renderHero();

    expect(phase(container)).toBe('waiting');
    expect(screen.getByRole('status').textContent).toBe('Cargando isla 3D');
    expect(sceneMounts).not.toHaveBeenCalled();
  });

  it('la imagen fija va en un <picture> que, sin reduced-motion, pide un GIF vacío', () => {
    const { container } = renderHero();
    const source = container.querySelector('picture source');
    expect(source?.getAttribute('media')).toBe('(prefers-reduced-motion: no-preference)');
    expect(source?.getAttribute('srcset')).toMatch(/^data:image\/gif;base64,/);
    // Con reduced-motion es el elemento del LCP: prioridad alta.
    expect(screen.getByRole('img', { name: ALT }).getAttribute('fetchpriority')).toBe('high');
  });

  it('pide la escena solo cuando el navegador queda libre y la isla está en pantalla', () => {
    const { container } = renderHero();

    act(() => {
      goIdle?.();
    });
    expect(sceneMounts).not.toHaveBeenCalled();

    act(() => {
      intersect?.(true);
    });
    expect(phase(container)).toBe('loading');
    expect(screen.getByTestId('scene').getAttribute('data-visible')).toBe('false');
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      scene?.onReady();
    });
    expect(phase(container)).toBe('ready');
    expect(screen.getByTestId('scene').getAttribute('data-visible')).toBe('true');
    // El spinner desaparece en cuanto el modelo está listo.
    expect(screen.queryByRole('status')).toBeNull();
    // La imagen sigue en el DOM con su alt, que describe también la escena.
    expect(screen.getByRole('img', { name: ALT })).toBeTruthy();
  });
});
