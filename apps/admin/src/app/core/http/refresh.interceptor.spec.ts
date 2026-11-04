import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { User } from '../api/api-types';
import { API_BASE_URL } from '../config/api-config';
import { SessionService } from '../session/session.service';
import { credentialsInterceptor } from './credentials.interceptor';
import { refreshInterceptor } from './refresh.interceptor';

const API = 'http://api.test';
const REFRESH = `${API}/api/v1/auth/refresh`;
const LOGIN = `${API}/api/v1/auth/login`;
const unauthorized = { status: 401, statusText: 'Unauthorized' };
const noContent = { status: 204, statusText: 'No Content' };
const user: User = { id: '1', email: 'admin@huitzi.xyz', role: 'admin' };

describe('refreshInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([credentialsInterceptor, refreshInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  // verify lanza si quedan peticiones abiertas. El reset va en finally para
  // que ese fallo no deje el TestBed instanciado y rompa los tests siguientes.
  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('ante tres 401 simultáneos hace un solo refresh y reintenta las tres peticiones', () => {
    const urls = [`${API}/api/v1/admin/posts`, `${API}/api/v1/auth/me`, `${API}/api/v1/admin/posts/1`];
    const results: unknown[] = [];
    for (const url of urls) {
      http.get(url).subscribe((body) => results.push(body));
    }

    for (const url of urls) {
      httpMock.expectOne(url).flush(null, unauthorized);
    }

    const refreshes = httpMock.match(REFRESH);
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush(null, noContent);

    urls.forEach((url, index) => httpMock.expectOne(url).flush({ index }));
    expect(results).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
  });

  it('un 401 en /auth/refresh no dispara otro refresh', () => {
    let status: number | undefined;
    http.post(REFRESH, null).subscribe({
      error: (error: HttpErrorResponse) => (status = error.status),
    });

    httpMock.expectOne(REFRESH).flush(null, unauthorized);

    expect(status).toBe(401);
    httpMock.expectNone(REFRESH);
  });

  it('un 401 en /auth/login no dispara refresh y llega al llamador', () => {
    let status: number | undefined;
    http.post(LOGIN, { email: 'a@b.co', password: 'x' }).subscribe({
      error: (error: HttpErrorResponse) => (status = error.status),
    });

    httpMock.expectOne(LOGIN).flush(null, unauthorized);

    expect(status).toBe(401);
    httpMock.expectNone(REFRESH);
  });

  it('un reintento que vuelve a dar 401 no hace un segundo refresh', () => {
    const url = `${API}/api/v1/admin/posts`;
    let status: number | undefined;
    http.get(url).subscribe({ error: (error: HttpErrorResponse) => (status = error.status) });

    httpMock.expectOne(url).flush(null, unauthorized);
    httpMock.expectOne(REFRESH).flush(null, noContent);
    httpMock.expectOne(url).flush(null, unauthorized);

    expect(status).toBe(401);
    httpMock.expectNone(REFRESH);
  });

  it('un 401 de otro origen no dispara refresh', () => {
    let status: number | undefined;
    http.get('https://other.example/data').subscribe({
      error: (error: HttpErrorResponse) => (status = error.status),
    });

    httpMock.expectOne('https://other.example/data').flush(null, unauthorized);

    expect(status).toBe(401);
    httpMock.expectNone(REFRESH);
  });

  it('un 401 de una ruta relativa, que va al origen del admin, no dispara refresh', () => {
    let status: number | undefined;
    http.get('/assets/x.json').subscribe({
      error: (error: HttpErrorResponse) => (status = error.status),
    });

    const request = httpMock.expectOne('/assets/x.json');
    expect(request.request.withCredentials).toBe(false);
    request.flush(null, unauthorized);

    expect(status).toBe(401);
    httpMock.expectNone(REFRESH);
  });

  it('si el refresh falla, limpia la sesión y redirige a /login con la URL de regreso', () => {
    const session = TestBed.inject(SessionService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    session.login({ email: user.email, password: 'x' }).subscribe();
    httpMock.expectOne(LOGIN).flush(user);
    expect(session.status()).toBe('authenticated');

    const url = `${API}/api/v1/admin/posts`;
    let status: number | undefined;
    http.get(url).subscribe({ error: (error: HttpErrorResponse) => (status = error.status) });
    httpMock.expectOne(url).flush(null, unauthorized);
    httpMock.expectOne(REFRESH).flush(null, unauthorized);

    expect(status).toBe(401);
    expect(session.status()).toBe('anonymous');
    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
  });

  it('otros errores pasan sin refresh', () => {
    const url = `${API}/api/v1/admin/posts`;
    let status: number | undefined;
    http.get(url).subscribe({ error: (error: HttpErrorResponse) => (status = error.status) });

    httpMock.expectOne(url).flush(null, { status: 500, statusText: 'Internal Server Error' });

    expect(status).toBe(500);
    httpMock.expectNone(REFRESH);
  });
});
