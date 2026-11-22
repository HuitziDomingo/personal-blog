// @vitest-environment jsdom
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { es } from '@/lib/content/es';

import { ColorModeToggle, HOVER_CLOSE_DELAY_MS, HOVER_QUERY } from './color-mode-toggle';
import { system } from './theme/system';

/** matchMedia de jsdom no existe: `hover` dice si el dispositivo tiene puntero fino con hover. */
function stubMedia(hover: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === HOVER_QUERY ? hover : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function setup() {
  render(
    <ChakraProvider value={system}>
      <ColorModeToggle labels={es.ui.colorMode} />
    </ChakraProvider>,
  );

  return screen.getByRole('button', { name: /tema/i });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isOpen = (trigger: HTMLElement) => trigger.getAttribute('aria-expanded') === 'true';

// jsdom no trae PointerEvent (sin él los eventos pierden pointerType) ni
// ResizeObserver (lo usa el posicionamiento del menú).
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  stubMedia(true);
  if (!('PointerEvent' in globalThis)) vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('menú de tema: teclado y click (BLOG-152)', () => {
  it('aria-controls apunta al menú y aria-expanded sigue su estado', async () => {
    const trigger = setup();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
  });

  it('Enter lo abre y Escape lo cierra y devuelve el foco al botón', async () => {
    const trigger = setup();
    trigger.focus();

    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(false);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('menú de tema: hover contra touch (BLOG-152)', () => {
  it('con mouse en un dispositivo con hover, se abre al pasar el cursor y se cierra 150 ms después de salir', async () => {
    const trigger = setup();

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    const left = Date.now();
    await sleep(HOVER_CLOSE_DELAY_MS - 60);
    expect(isOpen(trigger)).toBe(true);

    await waitFor(() => {
      expect(isOpen(trigger)).toBe(false);
    });
    expect(Date.now() - left).toBeGreaterThanOrEqual(HOVER_CLOSE_DELAY_MS);
  });

  it('llegar al menú antes de los 150 ms lo mantiene abierto', async () => {
    const trigger = setup();

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    await sleep(60);
    fireEvent.pointerEnter(screen.getByRole('menu'), { pointerType: 'mouse' });
    await sleep(HOVER_CLOSE_DELAY_MS * 3);
    expect(isOpen(trigger)).toBe(true);
  });

  it('un click mientras está abierto por hover lo deja abierto', async () => {
    const trigger = setup();

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });
    fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
    fireEvent.click(trigger);
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    await sleep(HOVER_CLOSE_DELAY_MS * 3);
    expect(isOpen(trigger)).toBe(true);
  });

  it('con el dedo no se abre al «pasar»: solo con tap', async () => {
    const trigger = setup();

    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    await sleep(50);
    expect(isOpen(trigger)).toBe(false);

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(isOpen(trigger)).toBe(true);
    });
  });

  it('en un dispositivo sin hover (móvil), el mouse tampoco lo abre al pasar', async () => {
    stubMedia(false);
    const trigger = setup();

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    await sleep(50);
    expect(isOpen(trigger)).toBe(false);
  });
});
