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

  return renderer(source);
}
