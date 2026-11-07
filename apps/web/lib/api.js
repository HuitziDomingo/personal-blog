// @ts-check
// Cliente de la API pública de posts, con fetch nativo y la caché de Next
// (ISR). Solo corre en el servidor: la API no recibe peticiones del navegador.

/** @typedef {import('@personal-blog/api-types').components['schemas']['Post']} Post */
/** @typedef {import('@personal-blog/api-types').components['schemas']['PostPage']} PostPage */
/** @typedef {import('@personal-blog/api-types').components['schemas']['PostSummary']} PostSummary */

/**
 * Patrón y largo del esquema Slug del contrato (docs/api/openapi.yaml).
 * encodeURIComponent no basta: deja pasar `.` y `..`, que cambian la ruta.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 80;

/** @param {string} slug */
export function isValidSlug(slug) {
  return slug.length <= SLUG_MAX_LENGTH && SLUG.test(slug);
}

/** Segundos que Next sirve una página desde caché antes de regenerarla. */
export const REVALIDATE_SECONDS = 60;

/** Origen de la API, sin barra final. En local, la de `make api-run`. */
export function apiBaseUrl() {
  return (process.env.API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
}

/**
 * Los posts publicados, el más reciente primero (orden de la API).
 * @param {{ limit?: number, offset?: number }} [page]
 * @returns {Promise<PostPage>}
 */
export async function listPublishedPosts({ limit = 20, offset = 0 } = {}) {
  const url = new URL('/api/v1/posts', apiBaseUrl());
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!response.ok) {
    throw new Error(`GET ${url.pathname}: ${response.status}`);
  }
  return /** @type {Promise<PostPage>} */ (response.json());
}

/**
 * Un post publicado por su slug, o `null` si no existe o no está publicado.
 * Un slug que no cumple el contrato no llega a la API: así no puede cambiar
 * la ruta de la petición ni gastar el cupo de la API.
 * @param {string} slug
 * @returns {Promise<Post | null>}
 */
export async function getPublishedPost(slug) {
  if (!isValidSlug(slug)) {
    return null;
  }
  const url = new URL(`/api/v1/posts/${slug}`, apiBaseUrl());

  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (response.status === 404 || response.status === 400) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET /api/v1/posts/{slug}: ${response.status}`);
  }
  return /** @type {Promise<Post>} */ (response.json());
}
