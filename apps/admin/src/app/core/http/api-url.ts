/** Rutas de la API que el admin usa, relativas a `API_BASE_URL`. */
export const API_PATHS = {
  login: '/api/v1/auth/login',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
  me: '/api/v1/auth/me',
  adminPosts: '/api/v1/admin/posts',
  improveWriting: '/api/v1/admin/assistant/improve-writing',
  suggestMetadata: '/api/v1/admin/assistant/suggest-metadata',
} as const;

/**
 * Resuelve `url` como lo hace el navegador: una URL relativa se resuelve
 * contra el `baseURI` del documento (el origen del admin), no contra la API.
 */
function resolve(url: string, documentBaseUri: string): URL | null {
  try {
    return new URL(url, documentBaseUri);
  } catch {
    return null;
  }
}

/**
 * Indica si `url` va al mismo origen que la API. Compara el origen ya
 * resuelto, no el prefijo del texto: `http://localhost:8080.evil.test` o
 * `http://localhost:8080@evil.test` empiezan igual pero son otro host. Una
 * ruta relativa como `/assets/x.json` va al origen del admin.
 */
export function isApiRequest(url: string, apiBaseUrl: string, documentBaseUri: string): boolean {
  const target = resolve(url, documentBaseUri);
  const api = resolve(apiBaseUrl, documentBaseUri);

  return target !== null && api !== null && target.origin === api.origin;
}

/** Indica si `url` apunta exactamente a `path` de la API. */
export function isApiPath(
  url: string,
  apiBaseUrl: string,
  documentBaseUri: string,
  path: string,
): boolean {
  if (!isApiRequest(url, apiBaseUrl, documentBaseUri)) {
    return false;
  }

  return resolve(url, documentBaseUri)?.pathname === path;
}
