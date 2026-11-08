import { describe, expect, it } from 'vitest';

import { ApiUnavailableError, createPostsApi, type ApiDeps, type PostPage } from './api';

const BASE = 'http://api.test';

function summary(slug: string): PostPage['items'][number] {
  return {
    id: slug,
    authorId: 'a',
    title: slug,
    slug,
    tags: [],
    status: 'published',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    publishedAt: '2026-11-01T00:00:00Z',
  };
}

/** Fake de fetch (ADR-015): responde según la ruta y registra cada llamada. */
class FakeApi {
  readonly calls: string[] = [];
  readonly sleeps: number[] = [];
  published: string[] = ['hola-mundo'];
  /** Respuestas forzadas por ruta, consumidas en orden. */
  readonly forced = new Map<string, Response[]>();

  deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
    return {
      baseUrl: BASE,
      isBuild: false,
      sleep: (ms) => {
        this.sleeps.push(ms);
        return Promise.resolve();
      },
      fetch: (url) => Promise.resolve(this.respond(url)),
      ...overrides,
    };
  }

  private respond(url: URL): Response {
    this.calls.push(url.pathname + url.search);
    const forced = this.forced.get(url.pathname)?.shift();
    if (forced) {
      return forced;
    }
    if (url.pathname === '/api/v1/posts') {
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      const items = this.published.slice(offset, offset + limit).map(summary);
      return Response.json({ items, total: this.published.length, limit, offset });
    }
    const slug = url.pathname.replace('/api/v1/posts/', '');
    return this.published.includes(slug)
      ? Response.json({ ...summary(slug), content: '# Hola' })
      : Response.json({ title: 'Not Found', status: 404 }, { status: 404 });
  }
}

function status(code: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ status: code }), { status: code, headers });
}

describe('getPublished', () => {
  it('devuelve el post publicado', async () => {
    const api = new FakeApi();

    const post = await createPostsApi(api.deps()).getPublished('hola-mundo');

    expect(post?.slug).toBe('hola-mundo');
  });

  it.each(['..', 'Hola', 'a/b', 'a'.repeat(81), '-a', ''])('un slug fuera del contrato (%j) no llama a la API', async (slug) => {
    const api = new FakeApi();

    expect(await createPostsApi(api.deps()).getPublished(slug)).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it('un slug inventado que cumple el patrón solo consulta la lista de publicados', async () => {
    const api = new FakeApi();
    const posts = createPostsApi(api.deps());

    expect(await posts.getPublished('no-existe')).toBeNull();
    expect(await posts.getPublished('tampoco-existe')).toBeNull();
    expect(api.calls.every((call) => call.startsWith('/api/v1/posts?'))).toBe(true);
  });

  it('solo un 404 de la API es «no existe»', async () => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts/hola-mundo', [status(404)]);

    expect(await createPostsApi(api.deps()).getPublished('hola-mundo')).toBeNull();
  });

  it.each([429, 500, 502, 503])('un %i nunca se convierte en 404: lanza ApiUnavailableError', async (code) => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts/hola-mundo', [status(code, { 'Retry-After': '1' })]);

    await expect(createPostsApi(api.deps()).getPublished('hola-mundo')).rejects.toMatchObject({
      name: 'ApiUnavailableError',
      status: code,
    });
  });

  it('si falla la lista de publicados, lanza en lugar de responder 404', async () => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts', [status(503)]);

    await expect(createPostsApi(api.deps()).getPublished('hola-mundo')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('un error de red tampoco es un 404', async () => {
    const api = new FakeApi();

    const posts = createPostsApi(api.deps({ fetch: () => Promise.reject(new TypeError('fetch failed')) }));

    await expect(posts.getPublished('hola-mundo')).rejects.toMatchObject({ name: 'ApiUnavailableError', status: null });
  });
});

describe('429 durante el build', () => {
  it('espera el Retry-After y reintenta', async () => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts', [status(429, { 'Retry-After': '7' }), status(429)]);

    const page = await createPostsApi(api.deps({ isBuild: true })).listPublished();

    expect(page.items.map((post) => post.slug)).toEqual(['hola-mundo']);
    expect(api.sleeps).toEqual([7000, 1000]);
  });

  it('se rinde tras 3 reintentos, y nunca espera más de 60 s', async () => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts', [429, 429, 429, 429].map((code) => status(code, { 'Retry-After': '3600' })));

    await expect(createPostsApi(api.deps({ isBuild: true })).listPublished()).rejects.toMatchObject({ status: 429 });
    expect(api.sleeps).toEqual([60_000, 60_000, 60_000]);
  });

  it('fuera del build no espera: lanza y Next conserva la página anterior', async () => {
    const api = new FakeApi();
    api.forced.set('/api/v1/posts', [status(429, { 'Retry-After': '7' })]);

    await expect(createPostsApi(api.deps()).listPublished()).rejects.toMatchObject({ status: 429 });
    expect(api.sleeps).toEqual([]);
  });
});

describe('publishedSlugs', () => {
  it('recorre todas las páginas de 100', async () => {
    const api = new FakeApi();
    api.published = Array.from({ length: 230 }, (_, i) => `post-${String(i)}`);

    const slugs = await createPostsApi(api.deps()).publishedSlugs();

    expect(slugs).toHaveLength(230);
    expect(api.calls).toEqual([
      '/api/v1/posts?limit=100&offset=0',
      '/api/v1/posts?limit=100&offset=100',
      '/api/v1/posts?limit=100&offset=200',
    ]);
  });
});

describe('sin API (WEB_SKIP_API=1, build del CI)', () => {
  it('no llama a nada y devuelve listas vacías', async () => {
    const api = new FakeApi();
    const posts = createPostsApi(api.deps({ baseUrl: null }));

    expect((await posts.listPublished()).items).toEqual([]);
    expect(await posts.publishedSlugs()).toEqual([]);
    expect(await posts.getPublished('hola-mundo')).toBeNull();
    expect(api.calls).toEqual([]);
  });
});
