/**
 * Patrón y largo del esquema Slug del contrato (docs/api/openapi.yaml).
 * encodeURIComponent no basta: deja pasar `.` y `..`, que cambian la ruta.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 80;

export function isValidSlug(slug: string): boolean {
  return slug.length <= SLUG_MAX_LENGTH && SLUG.test(slug);
}
