import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-config';
import { credentialsInterceptor } from './credentials.interceptor';

const API = 'http://api.test:8080';

describe('credentialsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([credentialsInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function sentWithCredentials(url: string): boolean {
    http.get(url).subscribe();
    const request = httpMock.expectOne(url);
    request.flush({});

    return request.request.withCredentials;
  }

  it('envía credenciales a la API', () => {
    expect(sentWithCredentials(`${API}/api/v1/auth/me`)).toBe(true);
  });

  it('no envía credenciales a otro origen', () => {
    expect(sentWithCredentials('https://other.example/api/v1/auth/me')).toBe(false);
  });

  it('no envía credenciales a otro puerto ni a un host que solo empieza igual', () => {
    expect(sentWithCredentials('http://api.test:9090/api/v1/auth/me')).toBe(false);
    expect(sentWithCredentials('http://api.test:8080.evil.test/api/v1/auth/me')).toBe(false);
    expect(sentWithCredentials('http://api.test:8080@evil.test/api/v1/auth/me')).toBe(false);
  });
});
