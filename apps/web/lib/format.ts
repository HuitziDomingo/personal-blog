const formats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string): Intl.DateTimeFormat {
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'America/Mexico_City' });
    formats.set(locale, format);
  }

  return format;
}

/**
 * Fecha de publicación legible en el idioma de la página (ADR-024, punto 6),
 * o null si no hay. Por defecto, español de México.
 */
export function formatDate(iso: string | null | undefined, locale = 'es-MX'): string | null {
  return iso ? dateFormat(locale).format(new Date(iso)) : null;
}
