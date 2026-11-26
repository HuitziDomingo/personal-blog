import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { PasswordApi } from './password-api';

const API = 'http://api.test';
const URL = `${API}/api/v1/auth/password`;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
  });

  return { api: TestBed.inject(PasswordApi), httpMock: TestBed.inject(HttpTestingController) };
}

describe('PasswordApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('cambia la contraseña con POST y la actual y la nueva en el cuerpo', async () => {
    const { api, httpMock } = setup();
    const body = { currentPassword: 'la-actual-larga', newPassword: 'una-frase-nueva-larga' };

    const result = firstValueFrom(api.change(body));
    const request = httpMock.expectOne({ method: 'POST', url: URL });
    expect(request.request.body).toEqual(body);
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeUndefined();
  });

  it('traduce el rechazo con el contexto de contraseña', async () => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.change({ currentPassword: 'x', newPassword: 'una-frase-nueva-larga' }));
    httpMock
      .expectOne(URL)
      .flush({ detail: 'current password is incorrect' }, { status: 400, statusText: 'Bad Request' });

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('La contraseña actual no es correcta.');
    expect((error as ApiError).status).toBe(400);
  });
});
