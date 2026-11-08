import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { prepareImages, renderPost } from './markdown';

it('sanitiza con packages/markdown y solo los links externos abren en otra pestaña', () => {
  const { html } = renderPost('[a](https://otro.example) [b](/posts/x) <img src=x onerror=alert(1)>');

  expect(html).toContain('<a href="https://otro.example" target="_blank" rel="noopener noreferrer">a</a>');
  expect(html).toContain('<a href="/posts/x">b</a>');
  expect(html).not.toContain('onerror');
});

describe('imágenes', () => {
  it('la primera va con prioridad alta y las demás en diferido', () => {
    const { html } = renderPost('![portada](/img/a.webp)\n\ntexto\n\n![b](/img/b.webp)\n\n![c](/img/c.webp)');

    expect(html).toContain('<img src="/img/a.webp" alt="portada" fetchpriority="high">');
    expect(html).toContain('<img src="/img/b.webp" alt="b" loading="lazy" decoding="async">');
    expect(html).toContain('<img src="/img/c.webp" alt="c" loading="lazy" decoding="async">');
  });

  it('devuelve la primera imagen como portada, o null sin imágenes', () => {
    expect(renderPost('![Uno & dos](/img/a.webp) ![b](/img/b.webp)').cover).toEqual({
      src: '/img/a.webp',
      alt: 'Uno & dos',
    });
    expect(renderPost('Sin imágenes').cover).toBeNull();
  });

  it('un title o un alt con «<img» no inyecta atributos', () => {
    const { html } = renderPost(
      '[t](/a "x <img onmouseover=alert(1) b") ![x <img onfocus=alert(1) autofocus z](/img/a.webp)',
    );
    const parsed = prepareImages(html).html;

    for (const out of [html, parsed]) {
      const doc = new JSDOM(out).window.document;
      const attributes = [...doc.querySelectorAll('*')].flatMap((el) => el.getAttributeNames());
      expect(attributes).not.toContain('onmouseover');
      expect(attributes).not.toContain('onfocus');
      expect(attributes).not.toContain('autofocus');
    }
  });

  it('el alt de la portada se lee del DOM, no del texto', () => {
    expect(prepareImages('<p><img src="/a.png" alt="a &gt; b"></p>').cover).toEqual({ src: '/a.png', alt: 'a > b' });
  });
});
