import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { User } from '../api/api-types';
import { API_BASE_URL } from '../config/api-config';
import { SessionService, SessionStatus } from './session.service';

const API = 'http://api.test';
const ME = `${API}/api/v1/auth/me`;
const LOGOUT = `${API}/api/v1/auth/logout`;
const user: User = { id: '1', email: 'admin@huitzi.xyz', role: 'admin' };

// Sin interceptores: aquí se prueba el servicio solo.
describe('SessionService', () => {
  let session: SessionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    });
    session = TestBed.inject(SessionService);
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

  it('empieza con el estado desconocido', () => {
    expect(session.status()).toBe('unknown');
    expect(session.user()).toBeNull();
  });

  it('dos consultas simultáneas comparten un solo /me y después no vuelve a preguntar', () => {
    const results: SessionStatus[] = [];
    session.ensureLoaded().subscribe((status) => results.push(status));
    session.ensureLoaded().subscribe((status) => results.push(status));

    httpMock.expectOne(ME).flush(user);

    expect(results).toEqual(['authenticated', 'authenticated']);
    expect(session.user()).toEqual(user);
    expect(session.isAuthenticated()).toBe(true);

    session.ensureLoaded().subscribe((status) => results.push(status));
    httpMock.expectNone(ME);
    expect(results).toHaveLength(3);
  });

  it('un 401 de /me deja la sesión anónima', () => {
    let result: SessionStatus | undefined;
    session.ensureLoaded().subscribe((status) => (result = status));

    httpMock.expectOne(ME).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(result).toBe('anonymous');
    expect(session.status()).toBe('anonymous');
  });

  it('un error de red no fija el estado y la siguiente consulta vuelve a preguntar', () => {
    let result: SessionStatus | undefined;
    session.ensureLoaded().subscribe((status) => (result = status));

    httpMock.expectOne(ME).error(new ProgressEvent('error'));

    expect(result).toBe('anonymous');
    expect(session.status()).toBe('unknown');

    session.ensureLoaded().subscribe();
    httpMock.expectOne(ME).flush(user);
    expect(session.status()).toBe('authenticated');
  });

  it('logout limpia la sesión y va a /login aunque falle la red', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    session.ensureLoaded().subscribe();
    httpMock.expectOne(ME).flush(user);

    let completed = false;
    session.logout().subscribe({ complete: () => (completed = true) });
    httpMock.expectOne(LOGOUT).error(new ProgressEvent('error'));

    expect(completed).toBe(true);
    expect(session.status()).toBe('anonymous');
    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('expire sin sesión previa no redirige: lo hace el guard', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    session.expire('/');

    expect(session.status()).toBe('anonymous');
    expect(navigate).not.toHaveBeenCalled();
  });
});
