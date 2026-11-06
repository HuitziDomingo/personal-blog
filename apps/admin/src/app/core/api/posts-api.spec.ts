import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { Post, PostPage, PostWrite } from './api-types';
import { PostsApi } from './posts-api';

const API = 'http://api.test';
const POSTS = `${API}/api/v1/admin/posts`;

const post: Post = {
  id: '6650f0c2a1b2c3d4e5f60718',
  authorId: 'a1',
  title: 'Hola',
  slug: 'hola',
  tags: [],
  status: 'draft',
  publishedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  content: '# Hola',
};
const page: PostPage = { items: [post], total: 1, limit: 20, offset: 0 };
const write: PostWrite = { title: 'Hola', content: '# Hola', status: 'draft' };

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
  });

  return { api: TestBed.inject(PostsApi), httpMock: TestBed.inject(HttpTestingController) };
}

describe('PostsApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista con limit y offset, sin status si no hay filtro', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.list({ limit: 20, offset: 40 }));
    const request = httpMock.expectOne((r) => r.url === POSTS);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['limit', 'offset']);
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.get('offset')).toBe('40');
    request.flush(page);

    expect(await result).toEqual(page);
  });

  it('lista filtrando por estado', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.list({ status: 'archived', limit: 20, offset: 0 }));
    const request = httpMock.expectOne((r) => r.url === POSTS);
    expect(request.request.params.get('status')).toBe('archived');
    request.flush(page);

    await result;
  });

  it('obtiene, crea, actualiza y archiva con el método y la URL del contrato', async () => {
    const { api, httpMock } = setup();
    const url = `${POSTS}/${post.id}`;

    const got = firstValueFrom(api.get(post.id));
    httpMock.expectOne({ method: 'GET', url }).flush(post);
    expect(await got).toEqual(post);

    const created = firstValueFrom(api.create(write));
    const createRequest = httpMock.expectOne({ method: 'POST', url: POSTS });
    expect(createRequest.request.body).toEqual(write);
    createRequest.flush(post);
    expect(await created).toEqual(post);

    const updated = firstValueFrom(api.update(post.id, write));
    const updateRequest = httpMock.expectOne({ method: 'PUT', url });
    expect(updateRequest.request.body).toEqual(write);
    updateRequest.flush(post);
    expect(await updated).toEqual(post);

    const archived = firstValueFrom(api.archive(post.id));
    httpMock.expectOne({ method: 'DELETE', url }).flush(null, { status: 204, statusText: 'No Content' });
    expect(await archived).toBeUndefined();
  });

  it('codifica el ID para que no cambie la ruta de la petición', async () => {
    const { api, httpMock } = setup();

    const slash = firstValueFrom(api.get('../auth/me'));
    httpMock.expectOne(`${POSTS}/%2E%2E%2Fauth%2Fme`).flush(post);
    await slash;

    const dots = firstValueFrom(api.get('..'));
    httpMock.expectOne(`${POSTS}/%2E%2E`).flush(post);
    await dots;
  });

  it('traduce los errores a ApiError con el mensaje en español y el detail del problem', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.update(post.id, write));
    httpMock
      .expectOne(`${POSTS}/${post.id}`)
      .flush(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'slug already exists' },
        { status: 409, statusText: 'Conflict' },
      );

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'El slug ya está en uso o ya no se puede cambiar.',
      status: 409,
      detail: 'slug already exists',
    });
  });

  it('un error de red sale como ApiError con status 0 y sin detail', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.archive(post.id));
    httpMock.expectOne(`${POSTS}/${post.id}`).error(new ProgressEvent('error'));

    const error = await result.catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, detail: null });
    expect((error as ApiError).message).toContain('No se pudo conectar');
  });
});
