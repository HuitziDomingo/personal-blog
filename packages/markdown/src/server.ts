import { JSDOM } from 'jsdom';

import { createRenderer, type MarkdownRenderer } from './renderer';

export { ALLOWED_ATTR, ALLOWED_TAGS, isSafeUrl, type UrlAttribute } from './policy';
export type { MarkdownRenderer } from './renderer';

export interface ServerRendererOptions {
  /** URL pública del sitio, p. ej. `https://huitzi.xyz`: los links relativos solo se conservan si resuelven a su origen. */
  siteUrl: string;
}

/**
 * Variante de servidor (ADR-017): la misma allowlist, política de URLs y motor
 * que la del navegador, con DOMPurify sobre un DOM de jsdom. Crea el DOM una
 * vez: guarda el render y reúsalo.
 */
export function createServerRenderer({ siteUrl }: ServerRendererOptions): MarkdownRenderer {
  const base = new URL(siteUrl).href;
  const { window } = new JSDOM('', { url: base });

  return createRenderer(window, () => base);
}
