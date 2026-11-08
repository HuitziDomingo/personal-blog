import type { components } from '@personal-blog/api-types';

import { apiBaseUrl, isBuildPhase, REVALIDATE_SECONDS } from './config';
import { isValidSlug } from './slug';

export type Post = components['schemas']['Post'];
export type PostPage = components['schemas']['PostPage'];
export type PostSummary = components['schemas']['PostSummary'];

/** Máximo de `limit` en el contrato. */
const MAX_LIMIT = 100;
/**
 * Reintentos de un 429 durante el build, y espera máxima por intento: 3 × 10 s
 * caben en el staticPageGenerationTimeout de Next (60 s).
 */
const BUILD_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 10_000;

/**
 * La API no respondió como se esperaba (429, 5xx, red). Nunca se convierte en
 * un 404: se lanza, y Next conserva la última versión buena de la página.
 */
export class ApiUnavailableError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiUnavailableError';
  }
}

export interface ApiDeps {
  fetch: (url: URL, init: RequestInit & { next?: { revalidate: number } }) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  /** Origen de la API, o null para construir sin ella. */
  baseUrl: string | null;
  isBuild: boolean;
}

export interface PostsApi {
  listPublished(page?: { limit?: number; offset?: number }): Promise<PostPage>;
  publishedSlugs(): Promise<string[]>;
  getPublished(slug: string): Promise<Post | null>;
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));

  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_WAIT_MS) : 1000;
}

export function createPostsApi(deps: ApiDeps): PostsApi {
  /** GET con la caché de Next. Devuelve null solo ante un 404 de la API. */
  async function get<T>(path: string, query: Record<string, number> = {}): Promise<T | null> {
    if (deps.baseUrl === null) {
      throw new Error('get called without an API');
    }

    const url = new URL(path, deps.baseUrl);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, String(value));
    }

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await deps.fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
      } catch (cause) {
        throw new ApiUnavailableError(null, `GET ${url.pathname}: network error`, { cause });
      }

      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status === 404) {
        return null;
      }
      // El build sí puede esperar: un 429 ahí no debe tirar el despliegue.
      if (response.status === 429 && deps.isBuild && attempt < BUILD_RETRIES) {
        await deps.sleep(retryAfterMs(response));
        continue;
      }

      throw new ApiUnavailableError(response.status, `GET ${url.pathname}: ${String(response.status)}`);
    }
  }

  async function listPublished({ limit = 20, offset = 0 } = {}): Promise<PostPage> {
    if (deps.baseUrl === null) {
      return { items: [], total: 0, limit, offset };
    }

    const page = await get<PostPage>('/api/v1/posts', { limit, offset });
    if (page === null) {
      throw new ApiUnavailableError(404, 'GET /api/v1/posts: 404');
    }

    return page;
  }

  /**
   * Todos los slugs publicados, el más reciente primero. Con la caché de Next
   * cuesta como mucho una pasada por minuto, sin importar cuántos slugs se
   * visiten.
   */
  async function publishedSlugs(): Promise<string[]> {
    const slugs: string[] = [];
    for (let offset = 0; ; offset += MAX_LIMIT) {
      const page = await listPublished({ limit: MAX_LIMIT, offset });
      slugs.push(...page.items.map((post) => post.slug));
      if (page.items.length < MAX_LIMIT || slugs.length >= page.total) {
        return slugs;
      }
    }
  }

  /**
   * Un post publicado por su slug, o null si no existe. Un slug que no cumple
   * el contrato o que no está en la lista de publicados no llega a la API: un
   * slug inventado no gasta el cupo de las IPs de Vercel.
   */
  async function getPublished(slug: string): Promise<Post | null> {
    if (!isValidSlug(slug) || deps.baseUrl === null) {
      return null;
    }
    if (!(await publishedSlugs()).includes(slug)) {
      return null;
    }

    return get<Post>(`/api/v1/posts/${slug}`);
  }

  return { listPublished, publishedSlugs, getPublished };
}

/** El cliente de la app, con fetch y la configuración del entorno. */
export const postsApi: PostsApi = createPostsApi({
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  get baseUrl() {
    return apiBaseUrl();
  },
  get isBuild() {
    return isBuildPhase();
  },
});
