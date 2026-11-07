// @ts-check
// Cliente de la API pública de posts, con fetch nativo y la caché de Next
// (ISR). Solo corre en el servidor: la API no recibe peticiones del navegador.

/** @typedef {import('@personal-blog/api-types').components['schemas']['Post']} Post */
/** @typedef {import('@personal-blog/api-types').components['schemas']['PostPage']} PostPage */
/** @typedef {import('@personal-blog/api-types').components['schemas']['PostSummary']} PostSummary */

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

  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS, tags: ['posts'] } });
  if (!response.ok) {
    throw new Error(`GET ${url.pathname}: ${response.status}`);
  }
  return /** @type {Promise<PostPage>} */ (response.json());
}

/**
 * Un post publicado por su slug, o `null` si no existe o no está publicado.
 * El slug se codifica: no puede cambiar la ruta de la petición.
 * @param {string} slug
 * @returns {Promise<Post | null>}
 */
export async function getPublishedPost(slug) {
  const url = new URL(`/api/v1/posts/${encodeURIComponent(slug)}`, apiBaseUrl());

  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS, tags: ['posts', `post:${slug}`] } });
  if (response.status === 404 || response.status === 400) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET /api/v1/posts/{slug}: ${response.status}`);
  }
  return /** @type {Promise<Post>} */ (response.json());
}
