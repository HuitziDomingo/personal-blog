import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';

import { API_BASE_URL } from '../../core/config/api-config';
import { FakeSession } from '../../core/session/session-fakes';
import { SessionService } from '../../core/session/session.service';
import { ProfilePage } from './profile.page';

const API = 'http://api.test';
const PASSWORD = `${API}/api/v1/auth/password`;
const CURRENT = 'la-contrasena-actual';
const NEXT = 'cielo rojo de marzo en León 7';

async function renderProfile() {
  const result = await render(ProfilePage, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: SessionService, useValue: new FakeSession() },
    ],
  });

  return { ...result, httpMock: TestBed.inject(HttpTestingController) };
}

const current = () => screen.getByLabelText('Contraseña actual') as HTMLInputElement;
const next = () => screen.getByLabelText('Contraseña nueva') as HTMLInputElement;
const confirm = () => screen.getByLabelText('Repite la contraseña nueva') as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: 'Cambiar contraseña' });

async function fill(values: { current?: string; next?: string; confirm?: string }) {
  if (values.current !== undefined) await fireEvent.input(current(), { target: { value: values.current } });
  if (values.next !== undefined) await fireEvent.input(next(), { target: { value: values.next } });
  if (values.confirm !== undefined) await fireEvent.input(confirm(), { target: { value: values.confirm } });
}

describe('ProfilePage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('muestra el email y el formulario con los autocompletes del navegador', async () => {
    await renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeTruthy();
    expect(screen.getByText('leon@huitzi.xyz')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cambiar contraseña' })).toBeTruthy();
    expect(current().type).toBe('password');
    expect(current().autocomplete).toBe('current-password');
    expect(next().autocomplete).toBe('new-password');
    expect(confirm().autocomplete).toBe('new-password');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('la contraseña nueva describe sus reglas y su fuerza para el lector de pantalla', async () => {
    await renderProfile();

    const describedBy = next().getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain('new-password-rules');
    expect(describedBy).toContain('new-password-strength');
    expect(document.getElementById('new-password-rules')?.textContent).toContain('Al menos 14 caracteres');
    expect(document.getElementById('new-password-strength')?.getAttribute('aria-live')).toBe('polite');
  });

  it('muestra la fuerza mientras se escribe', async () => {
    await renderProfile();

    expect(screen.queryByTestId('password-strength')).toBeNull();
    expect(document.getElementById('new-password-strength')?.textContent).toBe('');

    await fill({ next: 'corta' });
    expect(screen.getByTestId('password-strength')).toBeTruthy();
    expect(screen.getByText('Fuerza: Muy débil')).toBeTruthy();

    await fill({ next: NEXT });
    expect(screen.getByText('Fuerza: Muy fuerte')).toBeTruthy();
  });

  it('valida en el cliente y no llama a la API', async () => {
    const { httpMock } = await renderProfile();

    await fireEvent.click(submitButton());
    expect(await screen.findByText('Escribe tu contraseña actual.')).toBeTruthy();
    expect(screen.getByText('Escribe la contraseña nueva.')).toBeTruthy();
    expect(screen.getByText('Repite la contraseña nueva.')).toBeTruthy();

    await fill({ current: CURRENT, next: 'trece-letras!', confirm: 'trece-letras!' });
    expect(screen.getByText('Debe tener al menos 14 caracteres.')).toBeTruthy();

    await fill({ next: CURRENT, confirm: CURRENT });
    expect(screen.getByText('Debe ser distinta de la actual.')).toBeTruthy();

    // 25 caracteres, 75 bytes.
    await fill({ next: '€'.repeat(25), confirm: '€'.repeat(25) });
    expect(screen.getByText(/el máximo es 72 bytes/)).toBeTruthy();

    await fill({ next: NEXT, confirm: NEXT + 'x' });
    expect(screen.getByText('No coincide con la contraseña nueva.')).toBeTruthy();

    await fireEvent.click(submitButton());
    httpMock.expectNone(PASSWORD);
  });

  it('revalida la confirmación cuando cambia la nueva', async () => {
    await renderProfile();

    await fill({ current: CURRENT, confirm: NEXT, next: NEXT + 'x' });
    await fireEvent.blur(confirm());
    expect(screen.getByText('No coincide con la contraseña nueva.')).toBeTruthy();

    await fill({ next: NEXT });
    expect(screen.queryByText('No coincide con la contraseña nueva.')).toBeNull();
  });

  it('cambia la contraseña, vacía el formulario y lo anuncia', async () => {
    const { httpMock } = await renderProfile();

    await fill({ current: CURRENT, next: NEXT, confirm: NEXT });
    await fireEvent.click(submitButton());

    const request = httpMock.expectOne({ method: 'POST', url: PASSWORD });
    expect(request.request.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
    expect(screen.getByRole('button', { name: 'Guardando…' }).hasAttribute('disabled')).toBe(true);

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.'),
    );
    expect(current().value).toBe('');
    expect(next().value).toBe('');
    expect(confirm().value).toBe('');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('muestra el rechazo de la API como alerta y conserva lo escrito', async () => {
    const { httpMock } = await renderProfile();

    await fill({ current: 'no-es-la-actual', next: NEXT, confirm: NEXT });
    await fireEvent.click(submitButton());
    httpMock.expectOne(PASSWORD).flush({ detail: 'current password is incorrect' }, { status: 400, statusText: 'Bad Request' });

    expect((await screen.findByRole('alert')).textContent).toContain('La contraseña actual no es correcta.');
    expect(submitButton().hasAttribute('disabled')).toBe(false);
    expect(next().value).toBe(NEXT);
  });

  it('dice cuánto esperar si se agotan los intentos', async () => {
    const { httpMock } = await renderProfile();

    await fill({ current: CURRENT, next: NEXT, confirm: NEXT });
    await fireEvent.click(submitButton());
    httpMock
      .expectOne(PASSWORD)
      .flush({ detail: 'rate limit exceeded' }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '540' } });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Demasiados intentos de cambiar la contraseña. Inténtalo de nuevo en 9 minutos.',
    );
  });
});
