import { createRenderer } from './renderer.ts';

export { ALLOWED_ATTR, ALLOWED_TAGS, isSafeUrl, type UrlAttribute } from './policy.ts';
export type { MarkdownRenderer } from './renderer.ts';

/**
 * Variante de navegador: sanitiza con el DOM de la página y resuelve las URLs
 * relativas contra su URL. El resultado se puede enlazar con `[innerHTML]` en
 * Angular, que vuelve a pasar por su sanitizador. Nunca se usa
 * `bypassSecurityTrust*` sobre contenido del usuario (ADR-012).
 */
export const renderMarkdown = createRenderer(window, () => window.location.href);
