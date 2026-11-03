/** Rutas de la API que el admin usa, relativas a `API_BASE_URL`. */
export const API_PATHS = {
  login: '/api/v1/auth/login',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
  me: '/api/v1/auth/me',
} as const;

/**
 * Indica si `url` va al mismo origen que la API. Compara el origen ya
 * resuelto, no el prefijo del texto: `http://localhost:8080.evil.test` o
 * `http://localhost:8080@evil.test` empiezan igual pero son otro host.
 */
export function isApiRequest(url: string, apiBaseUrl: string): boolean {
  try {
    return new URL(url, apiBaseUrl).origin === new URL(apiBaseUrl).origin;
  } catch {
    return false;
  }
}

/** Indica si `url` apunta exactamente a `path` de la API. */
export function isApiPath(url: string, apiBaseUrl: string, path: string): boolean {
  if (!isApiRequest(url, apiBaseUrl)) {
    return false;
  }

  return new URL(url, apiBaseUrl).pathname === path;
}
