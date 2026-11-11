import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { aComment } from '../comments/comments-fakes';
import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { CommentPage } from './api-types';
import { CommentsApi } from './comments-api';

const API = 'http://api.test';
const COMMENTS = `${API}/api/v1/admin/comments`;
const comment = aComment();
const page: CommentPage = { items: [comment], total: 1, limit: 20, offset: 0 };

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
  });

  return { api: TestBed.inject(CommentsApi), httpMock: TestBed.inject(HttpTestingController) };
}

describe('CommentsApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista por estado con limit y offset', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.list({ status: 'pending', limit: 20, offset: 40 }));
    const request = httpMock.expectOne((r) => r.url === COMMENTS);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('status')).toBe('pending');
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.get('offset')).toBe('40');
    request.flush(page);

    expect(await result).toEqual(page);
  });

  it('sin estado no manda status', () => {
    const { api, httpMock } = setup();

    api.list({ limit: 20, offset: 0 }).subscribe();
    const request = httpMock.expectOne((r) => r.url === COMMENTS);
    expect(request.request.params.keys().sort()).toEqual(['limit', 'offset']);
    request.flush(page);
  });

  it.each([
    ['approve', (api: CommentsApi) => api.approve('c1')],
    ['reject', (api: CommentsApi) => api.reject('c1')],
    ['analyze', (api: CommentsApi) => api.analyze('c1')],
  ] as const)('%s hace POST sin cuerpo a su ruta', async (action, call) => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(call(api));
    const request = httpMock.expectOne(`${COMMENTS}/c1/${action}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(comment);

    expect(await result).toEqual(comment);
  });

  it('responde como autor con el contenido', () => {
    const { api, httpMock } = setup();

    api.reply('c1', 'Gracias').subscribe();
    const request = httpMock.expectOne(`${COMMENTS}/c1/replies`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ content: 'Gracias' });
    request.flush(comment, { status: 201, statusText: 'Created' });
  });

  it('un ID con / o .. no cambia la ruta', () => {
    const { api, httpMock } = setup();

    api.approve('../posts').subscribe({ error: () => undefined });
    httpMock.expectOne(`${COMMENTS}/%2E%2E%2Fposts/approve`).flush(comment);
  });

  it('traduce los errores con el contexto de comentarios', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.analyze('c1')).catch((error: unknown) => error);
    httpMock
      .expectOne(`${COMMENTS}/c1/analyze`)
      .flush({ detail: 'comment moderation is disabled' }, { status: 503, statusText: 'Service Unavailable' });

    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('La moderación con IA está desactivada');
    expect((error as ApiError).detail).toBe('comment moderation is disabled');
  });
});
