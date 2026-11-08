import { createServerRenderer, type MarkdownRenderer } from '@personal-blog/markdown/server';
import { JSDOM } from 'jsdom';

import { siteUrl } from './config';

let renderer: MarkdownRenderer | undefined;
let dom: JSDOM | undefined;

export interface RenderedPost {
  /** HTML sanitizado, listo para el navegador. */
  html: string;
  /** La primera imagen del post (suele ser la portada), tal como quedó tras sanitizar. */
  cover: { src: string; alt: string } | null;
}

/**
 * Markdown de un post a HTML sanitizado, en el servidor (ADR-017, punto 5).
 * Solo los links a otros sitios abren en otra pestaña. Los DOM de jsdom se
 * crean una vez, en el primer uso.
 */
export function renderPost(source: string): RenderedPost {
  renderer ??= createServerRenderer({ siteUrl: siteUrl(), newTab: 'external' });

  return prepareImages(renderer(source));
}

/**
 * Sobre el HTML ya sanitizado: la primera imagen se pide con prioridad alta y
 * las demás en diferido, y se devuelve la primera para Open Graph. Trabaja
 * sobre el DOM con setAttribute/getAttribute, nunca con texto: un `title` o un
 * `alt` que contenga `<img` sigue siendo el valor de un atributo.
 */
export function prepareImages(html: string): RenderedPost {
  dom ??= new JSDOM('');
  const template = dom.window.document.createElement('template');
  template.innerHTML = html;

  const images = [...template.content.querySelectorAll('img')];
  images.forEach((img, index) => {
    if (index === 0) {
      img.setAttribute('fetchpriority', 'high');
    } else {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    }
  });

  const first = images[0];
  const src = first?.getAttribute('src');

  return {
    html: template.innerHTML,
    cover: first && src ? { src, alt: first.getAttribute('alt') ?? '' } : null,
  };
}
