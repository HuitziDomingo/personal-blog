import { createRenderer, type MarkdownRenderer } from './renderer.ts';
import type { NewTabPolicy } from './policy.ts';

export { ALLOWED_ATTR, ALLOWED_TAGS, isExternalLink, isSafeUrl, type NewTabPolicy, type UrlAttribute } from './policy.ts';
export type { MarkdownRenderer } from './renderer.ts';

export interface BrowserRendererOptions {
  /** Qué links abren en otra pestaña; ver `NewTabPolicy`. */
  newTab: NewTabPolicy;
}

/**
 * Variante de navegador: sanitiza con el DOM de la página y resuelve las URLs
 * relativas contra su URL. El resultado se puede enlazar con `[innerHTML]` en
 * Angular, que vuelve a pasar por su sanitizador. Nunca se usa
 * `bypassSecurityTrust*` sobre contenido del usuario (ADR-012).
 */
export function createBrowserRenderer({ newTab }: BrowserRendererOptions): MarkdownRenderer {
  return createRenderer(window, () => window.location.href, newTab);
}

/** El render del admin: todos los links abren en otra pestaña. */
export const renderMarkdown = createBrowserRenderer({ newTab: 'all' });
