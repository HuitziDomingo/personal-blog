import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';

import { User } from '../../../core/api/api-types';
import { API_BASE_URL } from '../../../core/config/api-config';
import { LoginPage } from './login.page';

const API = 'http://api.test';
const LOGIN = `${API}/api/v1/auth/login`;
const user: User = { id: '1', email: 'admin@huitzi.xyz', role: 'admin' };

async function renderLogin(returnUrl?: string) {
  const result = await render(LoginPage, {
    inputs: returnUrl === undefined ? {} : { returnUrl },
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

  return { ...result, navigate, httpMock: TestBed.inject(HttpTestingController) };
}

async function fillAndSubmit(email = 'admin@huitzi.xyz', password = 'secreta') {
  await fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } });
  await fireEvent.input(screen.getByLabelText('Contraseña'), { target: { value: password } });
  await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginPage', () => {
  it('muestra el formulario con email y contraseña', async () => {
    await renderLogin();

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('no muestra errores antes de interactuar', async () => {
    await renderLogin();

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('muestra los errores de campos vacíos al enviar y no llama a la API', async () => {
    const { httpMock } = await renderLogin();

    await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu email.')).toBeTruthy();
    expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
    httpMock.expectNone(LOGIN);
  });

  it('rechaza un email con formato inválido', async () => {
    const { httpMock } = await renderLogin();

    await fillAndSubmit('no-es-un-email');

    expect(await screen.findByText('El email no es válido.')).toBeTruthy();
    expect(screen.queryByText('Escribe tu contraseña.')).toBeNull();
    httpMock.expectNone(LOGIN);
  });

  it('envía las credenciales y vuelve a la URL de regreso', async () => {
    const { httpMock, navigate, fixture } = await renderLogin('/posts?page=2');

    await fillAndSubmit();
    const request = httpMock.expectOne(LOGIN);
    expect(request.request.body).toEqual({ email: 'admin@huitzi.xyz', password: 'secreta' });
    await fixture.whenStable();
    expect(screen.getByRole('button', { name: 'Entrar' }).hasAttribute('disabled')).toBe(true);
    request.flush(user);

    expect(navigate).toHaveBeenCalledWith('/posts?page=2');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('con una URL de regreso externa va al dashboard', async () => {
    const { httpMock, navigate } = await renderLogin('//evil.test');

    await fillAndSubmit();
    httpMock.expectOne(LOGIN).flush(user);

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('con credenciales inválidas muestra el error en español', async () => {
    const { httpMock, navigate } = await renderLogin();

    await fillAndSubmit();
    httpMock
      .expectOne(LOGIN)
      .flush({ title: 'Unauthorized', detail: 'invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Email o contraseña incorrectos.');
    expect(screen.getByRole('button', { name: 'Entrar' }).hasAttribute('disabled')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('con demasiados intentos dice cuánto esperar', async () => {
    const { httpMock } = await renderLogin();

    await fillAndSubmit();
    httpMock.expectOne(LOGIN).flush(
      { title: 'Too Many Requests', detail: 'too many login attempts' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '900' } },
    );

    expect(await screen.findByText('Demasiados intentos. Inténtalo de nuevo en 15 minutos.')).toBeTruthy();
  });
});
