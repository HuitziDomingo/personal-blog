/** Segundos que Next sirve una página desde caché antes de regenerarla (ADR-017). */
export const REVALIDATE_SECONDS = 60;

/**
 * Posts que el build pregenera, los más recientes. El resto se genera en su
 * primera visita. Acota las peticiones del build a la API: 1 lista de inicio +
 * 1 lista de slugs + PRERENDER_LIMIT posts, por debajo de la ráfaga anónima de
 * 20 por IP (ADR-010). Con varios workers la lista puede pedirse más de una
 * vez; el reintento ante un 429 cubre ese caso.
 */
export const PRERENDER_LIMIT = 10;

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Origen de la API sin barra final, o `null` si se pidió construir sin API
 * (`WEB_SKIP_API=1`, solo para el build del CI). En producción `API_BASE_URL`
 * es obligatoria: sin ella el build falla en lugar de publicar un sitio vacío.
 */
export function apiBaseUrl(env: Env = process.env): string | null {
  if (env['WEB_SKIP_API'] === '1') {
    // En Vercel publicaría un sitio vacío y cachearía 404 en cada post.
    if (env['VERCEL']) {
      throw new Error('WEB_SKIP_API is only for CI builds, never on Vercel');
    }
    return null;
  }

  const configured = env['API_BASE_URL'];
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (env['NODE_ENV'] === 'production') {
    throw new Error('API_BASE_URL is required (or WEB_SKIP_API=1 to build without the API)');
  }

  return 'http://localhost:8080';
}

/** URL pública del sitio: decide qué links son internos. */
export function siteUrl(env: Env = process.env): string {
  return env['SITE_URL'] ?? 'https://huitzi.xyz';
}

/** `true` mientras corre `next build`: solo ahí se reintenta un 429. */
export function isBuildPhase(env: Env = process.env): boolean {
  return env['NEXT_PHASE'] === 'phase-production-build';
}
