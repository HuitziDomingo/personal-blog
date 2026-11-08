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
 * La primera imagen del post, que suele ser la portada y el elemento más
 * grande de la página, se pide con prioridad alta; las demás, en diferido.
 * Se aplica al HTML ya
 * sanitizado y solo añade dos atributos fijos, así que no abre nada que la
 * allowlist haya cerrado.
 */
export function lazyImages(html: string): string {
  let seen = 0;

  return html.replace(/<img\b/g, (tag) =>
    seen++ === 0 ? `${tag} fetchpriority="high"` : `${tag} loading="lazy" decoding="async"`,
  );
}
