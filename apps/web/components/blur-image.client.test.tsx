// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlurImage } from './blur-image';

const props = { src: '/img/blog/init.webp', alt: 'Captura', width: 1024, height: 576 };

function stubComplete(value: boolean) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(value);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BlurImage en el navegador', () => {
  it('si al hidratar la imagen sigue cargando, la marca y la desmarca al cargar (fundido)', () => {
    stubComplete(false);
    render(<BlurImage {...props} />);
    const img = screen.getByRole('img', { name: 'Captura' });

    expect(img.hasAttribute('data-blur-loading')).toBe(true);
    fireEvent.load(img);
    expect(img.hasAttribute('data-blur-loading')).toBe(false);
  });

  it('si falla, también la desmarca: nunca queda oculta', () => {
    stubComplete(false);
    render(<BlurImage {...props} />);
    const img = screen.getByRole('img', { name: 'Captura' });

    fireEvent.error(img);
    expect(img.hasAttribute('data-blur-loading')).toBe(false);
  });

  it('si ya cargó (el LCP con priority), no la oculta', () => {
    stubComplete(true);
    render(<BlurImage {...props} preload />);

    expect(screen.getByRole('img', { name: 'Captura' }).hasAttribute('data-blur-loading')).toBe(false);
  });
});
