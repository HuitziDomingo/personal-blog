/** Segundos que Next sirve una página desde caché antes de regenerarla (ADR-017). */
export const REVALIDATE_SECONDS = 60;

export type Env = Readonly<Record<string, string | undefined>>;

/** Posts que el build pregenera por defecto (ADR-020). */
export const DEFAULT_PRERENDER_LIMIT = 10;

/** Ráfaga anónima por IP de la API (ADR-010; sin cambios en ADR-016, punto 3). */
export const API_ANONYMOUS_BURST = 20;

/**
 * Posts que el build pregenera, los más recientes (ADR-020). El resto se genera
 * en su primera visita. Acota las peticiones del build a la API: 1 lista de
 * inicio + 1 lista de slugs por cada 100 publicados + N posts, que con el valor
 * por defecto queda por debajo de la ráfaga anónima de 20 por IP (ADR-010 y
 * ADR-016). Con varios workers la lista puede pedirse más de una vez; el
 * reintento ante un 429 cubre ese caso.
 */
export function prerenderLimit(env: Env = process.env): number {
  const configured = env['WEB_PRERENDER_LIMIT'];
  if (configured === undefined || configured === '') {
    warnIfOverBurst(DEFAULT_PRERENDER_LIMIT, env);
    return DEFAULT_PRERENDER_LIMIT;
  }
  if (!/^\d+$/.test(configured)) {
    throw new Error(`WEB_PRERENDER_LIMIT must be a non-negative integer, got "${configured}"`);
  }

  const limit = Number(configured);
  warnIfOverBurst(limit, env);

  return limit;
}

/**
 * Peticiones del build a la API: lista de inicio + una página de slugs + los
 * posts (ADR-020, Consecuencias), y con comentarios una más por post. Si pasan
 * la ráfaga anónima, el build puede recibir 429 (lo reintenta, pero tarda).
 */
export function buildRequests(limit: number, env: Env = process.env): number {
  return 2 + limit * (commentsEnabled(env) ? 2 : 1);
}

function warnIfOverBurst(limit: number, env: Env): void {
  const requests = buildRequests(limit, env);
  if (requests > API_ANONYMOUS_BURST) {
    console.warn(
      `WEB_PRERENDER_LIMIT=${String(limit)} needs about ${String(requests)} build requests, over the API anonymous burst (${String(API_ANONYMOUS_BURST)}): the build may get 429`,
    );
  }
}

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

/**
 * Comentarios en los posts (ADR-022, punto 10). Apagados por defecto, igual
 * que `COMMENTS_ENABLED` de la API: con `false` la sección no se muestra, no se
 * piden comentarios a la API y la CSP no abre `connect-src` a la API. Debe
 * coincidir con el valor de la API; si la web los muestra y la API no, el
 * envío responde 404 y el formulario lo dice.
 */
export function commentsEnabled(env: Env = process.env): boolean {
  return env['COMMENTS_ENABLED'] === 'true';
}

/**
 * Origen al que el navegador envía los comentarios: el de la API, solo con
 * los comentarios encendidos y una API configurada. Es lo único que se agrega
 * a `connect-src` (ADR-022, punto 8).
 */
export function commentsApiOrigin(env: Env = process.env): string | null {
  if (!commentsEnabled(env)) {
    return null;
  }
  const base = apiBaseUrl(env);

  return base === null ? null : new URL(base).origin;
}
