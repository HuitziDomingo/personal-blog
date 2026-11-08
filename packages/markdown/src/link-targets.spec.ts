// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createBrowserRenderer, renderMarkdown } from './index';
import { isExternalLink } from './policy';
import { createServerRenderer } from './server';

const SOURCE = [
  '[externo](https://otro.example/x)',
  '[externo http](http://otro.example)',
  '[mismo sitio con otro esquema](http://huitzi.xyz/x)',
  '[mismo sitio](https://huitzi.xyz/posts/a)',
  '[ruta](/posts/b)',
  '[relativo](c)',
  '[ancla](#seccion)',
  '[correo](mailto:hola@huitzi.xyz)',
  '<a href="/posts/d" target="_blank" rel="opener">con target propio</a>',
  '<a href="https://otro.example" target="_self" rel="opener">externo con target propio</a>',
].join(' ');

function targets(html: string): Record<string, [string | null, string | null]> {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Object.fromEntries(
    [...container.querySelectorAll('a')].map((a) => [a.textContent, [a.getAttribute('target'), a.getAttribute('rel')]]),
  );
}

const NEW_TAB: [string, string] = ['_blank', 'noopener noreferrer'];
const SAME_TAB: [null, null] = [null, null];

describe.each([
  ['navegador', createBrowserRenderer({ newTab: 'external' })],
  ['servidor', createServerRenderer({ siteUrl: 'https://huitzi.xyz', newTab: 'external' })],
])('newTab: external (%s)', (_variant, render) => {
  it('solo los links a otro sitio abren en otra pestaña', () => {
    expect(targets(render(SOURCE))).toEqual({
      externo: NEW_TAB,
      'externo http': NEW_TAB,
      'mismo sitio con otro esquema': NEW_TAB,
      'mismo sitio': SAME_TAB,
      ruta: SAME_TAB,
      relativo: SAME_TAB,
      ancla: SAME_TAB,
      correo: SAME_TAB,
      'con target propio': SAME_TAB,
      'externo con target propio': NEW_TAB,
    });
  });
});

it('el admin (newTab: all) sigue abriendo todos en otra pestaña', () => {
  for (const pair of Object.values(targets(renderMarkdown(SOURCE)))) {
    expect(pair).toEqual(NEW_TAB);
  }
});

describe('isExternalLink', () => {
  const base = 'https://huitzi.xyz/posts/hola';

  it.each(['https://otro.example', 'http://huitzi.xyz', 'https://huitzi.xyz:8443/x', '//otro.example/x'])('%s es externo', (href) => {
    expect(isExternalLink(href, base)).toBe(true);
  });

  it.each(['/x', 'x', '#a', 'https://huitzi.xyz/y', 'mailto:a@b.c', 'http://[::1'])('%s no es externo', (href) => {
    expect(isExternalLink(href, base)).toBe(false);
  });
});
