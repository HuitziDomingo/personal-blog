// @vitest-environment jsdom
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { en } from '@/lib/content/en';
import { es } from '@/lib/content/es';
import type { SiteContent } from '@/lib/content/types';

import { isActive, SiteHeader } from './site-header';
import { system } from './theme/system';

const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

const PDF = 'https://storage.googleapis.com/bucket/cv/es/0123456789abcdef01234567.pdf';

function setup(content: SiteContent, path: string, cvUrl: string | null = PDF) {
  pathname.value = path;
  render(
    <ChakraProvider value={system}>
      <SiteHeader locale={content.locale} ui={content.ui} cvUrl={cvUrl} />
    </ChakraProvider>,
  );

  return screen.getByRole('navigation', { name: content.ui.primaryNav });
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Los links del nav de escritorio (la primera lista del <nav>). */
function desktopLinks(nav: HTMLElement) {
  const [list] = within(nav).getAllByRole('list');
  if (!list) throw new Error('sin lista');

  return within(list).getAllByRole('link');
}

describe('nav de la cabecera (BLOG-152)', () => {
  it('«Inicio» va primero y lleva a / en español', () => {
    const links = desktopLinks(setup(es, '/blog'));
    expect(links.map((a) => a.textContent)).toEqual(['Inicio', 'Trabajos', 'CV', 'Blog']);
    expect(links[0]?.getAttribute('href')).toBe('/');
  });

  it('«Home» lleva a /en en inglés', () => {
    const [home] = desktopLinks(setup(en, '/en/work'));
    expect(home?.textContent).toBe('Home');
    expect(home?.getAttribute('href')).toBe('/en');
  });

  it('aria-current="page" solo en el ítem activo; el inicio solo en su ruta exacta', () => {
    const links = desktopLinks(setup(es, '/blog/un-post'));
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['Blog']);
    cleanup();

    const onHome = desktopLinks(setup(es, '/'));
    expect(onHome.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['Inicio']);
  });

  it('isActive: el inicio no queda activo en el resto de páginas', () => {
    expect(isActive('/works', { href: '/', exact: true })).toBe(false);
    expect(isActive('/en/work/debred', { href: '/en/work' })).toBe(true);
  });

  it('cada ítem lleva un ícono decorativo y su texto visible', () => {
    for (const link of desktopLinks(setup(es, '/'))) {
      const svg = link.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(link.textContent.trim()).not.toBe('');
    }
  });

  it('el menú móvil tiene los mismos ítems, con ícono, y el botón del CV destacado arriba', () => {
    setup(es, '/');
    const menu = document.getElementById('menu-movil');
    if (!menu) throw new Error('sin menú móvil');
    const links = within(menu).getAllByRole('link', { hidden: true });
    expect(links.map((a) => a.textContent)).toEqual(['Descargar CV', 'Inicio', 'Trabajos', 'CV', 'Blog']);
    for (const link of links) expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('botón «Descargar CV» (BLOG-152)', () => {
  it('lleva al mismo PDF vigente que el botón de /cv, en la cabecera y en el menú móvil', () => {
    setup(es, '/');
    const buttons = screen.getAllByRole('link', { name: 'Descargar CV', hidden: true });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.getAttribute('href')).toBe(PDF);
      expect(button.classList.contains('cv-cta')).toBe(true);
    }
  });

  it('dice «Download CV» en inglés', () => {
    setup(en, '/en');
    expect(screen.getAllByRole('link', { name: 'Download CV', hidden: true })).toHaveLength(2);
  });

  it('sin PDF vigente no aparece', () => {
    setup(es, '/', null);
    expect(screen.queryAllByRole('link', { name: 'Descargar CV', hidden: true })).toHaveLength(0);
  });
});

describe('logo de la cabecera (BLOG-158)', () => {
  it('el león es decorativo y el link conserva su nombre', () => {
    setup(es, '/');
    const home = screen.getByRole('link', { name: es.ui.homeLinkLabel });
    const img = home.querySelector('img');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('alt')).toBe('');
    // En el build es /_next/static/media/leon.….svg; Vite (en los tests) lo pone inline.
    expect(img?.getAttribute('src')).toMatch(/leon\..*svg|^data:image\/svg\+xml/);
  });
});
