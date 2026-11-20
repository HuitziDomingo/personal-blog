import type { Locale } from "./types";

/** Prefijo de las rutas de cada idioma (ADR-024, punto 1): español en la raíz. */
export function localePrefix(locale: Locale): string {
  return locale === "en" ? "/en" : "";
}

/**
 * Rutas con otro nombre en inglés (ADR-028, punto 1): el CV es `/cv` en
 * español y `/en/resume` en inglés. La clave es la ruta en español.
 */
const ENGLISH_SLUGS: Readonly<Record<string, string>> = { "/cv": "/resume" };

/** Ruta de una página del portafolio en un idioma: `/works` → `/en/works`, `/cv` → `/en/resume`. */
export function localizedPath(locale: Locale, path: string): string {
  const prefix = localePrefix(locale);
  if (!prefix) {
    return path;
  }

  if (path === "/") {
    return prefix;
  }

  return `${prefix}${ENGLISH_SLUGS[path] ?? path}`;
}

/** Ruta en español de una ruta en inglés sin el prefijo: `/resume` → `/cv`. */
function spanishPath(englishPath: string): string {
  const entry = Object.entries(ENGLISH_SLUGS).find(
    ([, english]) => english === englishPath
  );

  return entry ? entry[0] : englishPath;
}

/** Páginas que existen en los dos idiomas: inicio, trabajos, cada trabajo y el CV. */
function isPortfolioPath(path: string): boolean {
  return (
    path === "/" ||
    path === "/works" ||
    Object.hasOwn(ENGLISH_SLUGS, path) ||
    /^\/works\/[^/]+$/.test(path)
  );
}

/**
 * Página equivalente en el otro idioma, para el selector ES/EN. El blog solo
 * existe en español, así que desde él el selector lleva al inicio en inglés.
 */
export function alternateHref(pathname: string, from: Locale): string {
  if (from === "en") {
    const rest = pathname.replace(/^\/en(?=\/|$)/, "");

    return rest === "" ? "/" : spanishPath(rest);
  }

  return localizedPath("en", isPortfolioPath(pathname) ? pathname : "/");
}

/** Idioma de una ruta: `/en` y lo que cuelga de él es inglés. */
export function localeOf(pathname: string): Locale {
  return /^\/en(\/|$)/.test(pathname) ? "en" : "es";
}
