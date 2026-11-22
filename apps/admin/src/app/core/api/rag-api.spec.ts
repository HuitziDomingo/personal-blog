import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { RagApi } from './rag-api';

const API = 'http://api.test';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
  });

  return { api: TestBed.inject(RagApi), httpMock: TestBed.inject(HttpTestingController) };
}

describe('RagApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lee el estado con GET', async () => {
    const { api, httpMock } = setup();
    const status = { enabled: true, model: 'm', publishedPosts: 1, indexedPosts: 1, pendingPosts: 0, chunks: 3 };

    const result = firstValueFrom(api.status());
    httpMock.expectOne({ method: 'GET', url: `${API}/api/v1/admin/rag/status` }).flush(status);

    expect(await result).toEqual(status);
  });

  it('reindexa con POST sin cuerpo', async () => {
    const { api, httpMock } = setup();
    const reindexed = { posts: 2, indexed: 2, pending: 0, removed: 0, chunks: 5 };

    const result = firstValueFrom(api.reindex());
    const request = httpMock.expectOne({ method: 'POST', url: `${API}/api/v1/admin/rag/reindex` });
    expect(request.request.body).toBeNull();
    request.flush(reindexed);

    expect(await result).toEqual(reindexed);
  });

  it('traduce el 429 del reindexado con el límite del asistente', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.reindex()).catch((error: unknown) => error);
    httpMock
      .expectOne(`${API}/api/v1/admin/rag/reindex`)
      .flush({ status: 429 }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } });

    const error = (await result) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Hiciste demasiadas peticiones al asistente seguidas. Inténtalo de nuevo en 30 segundos.');
  });
});
