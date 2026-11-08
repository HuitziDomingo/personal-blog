import { expect, it } from 'vitest';

import { lazyImages, renderPostMarkdown } from './markdown';

it('sanitiza con packages/markdown y solo los links externos abren en otra pestaña', () => {
  const html = renderPostMarkdown('[a](https://otro.example) [b](/posts/x) <img src=x onerror=alert(1)>');

  expect(html).toContain('<a href="https://otro.example" target="_blank" rel="noopener noreferrer">a</a>');
  expect(html).toContain('<a href="/posts/x">b</a>');
  expect(html).not.toContain('onerror');
});

it('carga diferida para todas las imágenes salvo la primera', () => {
  const html = renderPostMarkdown('![portada](/img/a.webp)\n\ntexto\n\n![b](/img/b.webp)\n\n![c](/img/c.webp)');

  expect(html).toContain('<img src="/img/a.webp" alt="portada">');
  expect(html).toContain('<img loading="lazy" decoding="async" src="/img/b.webp" alt="b">');
  expect(html).toContain('<img loading="lazy" decoding="async" src="/img/c.webp" alt="c">');
});

it('lazyImages no toca texto que solo se parece a una etiqueta', () => {
  expect(lazyImages('<p>&lt;img src=x&gt;</p><img src="a"><img src="b">')).toBe(
    '<p>&lt;img src=x&gt;</p><img src="a"><img loading="lazy" decoding="async" src="b">',
  );
});
