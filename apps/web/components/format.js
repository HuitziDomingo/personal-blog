// @ts-check

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' });

/**
 * Fecha de publicación legible, o null si no hay.
 * @param {string | null | undefined} iso
 */
export function formatDate(iso) {
  return iso ? dateFormat.format(new Date(iso)) : null;
}
