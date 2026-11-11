import type { Locale } from './types';

/** Prefijo de las rutas de cada idioma (ADR-024, punto 1): español en la raíz. */
export function localePrefix(locale: Locale): string {
  return locale === 'en' ? '/en' : '';
}

/** Ruta de una página del portafolio en un idioma: `/works` → `/en/works`. */
export function localizedPath(locale: Locale, path: string): string {
  const prefix = localePrefix(locale);
  if (!prefix) {
    return path;
  }

  return path === '/' ? prefix : `${prefix}${path}`;
}

/** Páginas que existen en los dos idiomas: inicio, trabajos y cada trabajo. */
function isPortfolioPath(path: string): boolean {
  return path === '/' || path === '/works' || /^\/works\/[^/]+$/.test(path);
}

/**
 * Página equivalente en el otro idioma, para el selector ES/EN. El blog solo
 * existe en español, así que desde él el selector lleva al inicio en inglés.
 */
export function alternateHref(pathname: string, from: Locale): string {
  if (from === 'en') {
    const rest = pathname.replace(/^\/en(?=\/|$)/, '');

    return rest === '' ? '/' : rest;
  }

  return localizedPath('en', isPortfolioPath(pathname) ? pathname : '/');
}

/** Idioma de una ruta: `/en` y lo que cuelga de él es inglés. */
export function localeOf(pathname: string): Locale {
  return /^\/en(\/|$)/.test(pathname) ? 'en' : 'es';
}
