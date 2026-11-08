import { createServerRenderer, type MarkdownRenderer } from '@personal-blog/markdown/server';

import { siteUrl } from './config';

let renderer: MarkdownRenderer | undefined;

/**
 * Markdown de un post a HTML sanitizado, en el servidor (ADR-017, punto 5).
 * Solo los links a otros sitios abren en otra pestaña. El DOM de jsdom se crea
 * una vez, en el primer uso.
 */
export function renderPostMarkdown(source: string): string {
  renderer ??= createServerRenderer({ siteUrl: siteUrl(), newTab: 'external' });

  return lazyImages(renderer(source));
}

/**
 * Carga diferida para las imágenes del post salvo la primera, que suele ser la
 * portada y el elemento más grande de la página. Se aplica al HTML ya
 * sanitizado y solo añade dos atributos fijos, así que no abre nada que la
 * allowlist haya cerrado.
 */
export function lazyImages(html: string): string {
  let seen = 0;

  return html.replace(/<img\b/g, (tag) => (seen++ === 0 ? tag : `${tag} loading="lazy" decoding="async"`));
}
