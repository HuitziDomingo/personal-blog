/**
 * Etiquetas y atributos que puede producir el render (ADR-010, punto 4;
 * ADR-012, punto 6; ADR-017, punto 5). Es una allowlist: lo que no está aquí se
 * elimina, aunque DOMPurify lo permita por defecto.
 *
 * No agregues `svg`, `math`, `style`, `template`, `textarea`, `title`,
 * `noscript` ni `iframe`: son la base de los ataques de mutation XSS, en los
 * que el HTML sanitizado se reparsea distinto en el navegador.
 */
export const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
] as const;

export const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'start', 'align'] as const;

export type UrlAttribute = 'href' | 'src';

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Decide si una URL se conserva. DOMPurify deja pasar `data:` en <img> aunque
 * su expresión de URIs no lo acepte, así que las URLs se filtran también en un
 * hook, con el parser de URLs WHATWG, el mismo del navegador: `/\host`,
 * `\\host` o `/`, tab y `/host` resuelven a `//host`.
 * - Absolutas: solo `https:` y `http:`, y `mailto:` en links.
 * - Relativas: solo si resuelven al origen de `baseUrl`, la página donde se
 *   muestra el HTML.
 * - Anclas (`#…`): en links se aceptan sin resolverlas; en `src` son una ruta
 *   relativa más, que resuelve a la propia página.
 */
export function isSafeUrl(value: string, attribute: UrlAttribute, baseUrl: string): boolean {
  const trimmed = value.trim();
  if (attribute === 'href' && trimmed.startsWith('#')) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    return false;
  }

  if (!ABSOLUTE.test(trimmed)) {
    return url.origin === new URL(baseUrl).origin;
  }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    return true;
  }
  return attribute === 'href' && url.protocol === 'mailto:';
}
