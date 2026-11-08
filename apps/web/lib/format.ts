const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' });

/** Fecha de publicación legible, o null si no hay. */
export function formatDate(iso: string | null | undefined): string | null {
  return iso ? dateFormat.format(new Date(iso)) : null;
}
