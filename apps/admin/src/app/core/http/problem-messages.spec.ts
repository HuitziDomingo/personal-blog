import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { problemMessage } from './problem-messages';

function httpError(status: number, headers: Record<string, string> = {}): HttpErrorResponse {
  return new HttpErrorResponse({ status, headers: new HttpHeaders(headers) });
}

describe('problemMessage', () => {
  it('traduce cada estado', () => {
    expect(problemMessage(httpError(0))).toContain('No se pudo conectar');
    expect(problemMessage(httpError(400))).toBe('Revisa los datos enviados.');
    expect(problemMessage(httpError(400), 'login')).toBe('Revisa el email y la contraseña.');
    expect(problemMessage(httpError(401), 'login')).toBe('Email o contraseña incorrectos.');
    expect(problemMessage(httpError(401))).toBe('Tu sesión expiró. Inicia sesión de nuevo.');
    expect(problemMessage(httpError(403))).toBe('El servidor rechazó la petición desde este sitio.');
    expect(problemMessage(httpError(413))).toBe('Los datos enviados son demasiado grandes.');
    expect(problemMessage(httpError(500))).toBe('Error inesperado del servidor. Inténtalo de nuevo.');
    expect(problemMessage(new Error('boom'))).toBe('Error inesperado del servidor. Inténtalo de nuevo.');
  });

  it('el 429 dice cuánto esperar según Retry-After', () => {
    const wait = (retryAfter: string) => problemMessage(httpError(429, { 'Retry-After': retryAfter }));

    expect(wait('1')).toBe('Demasiados intentos. Inténtalo de nuevo en 1 segundo.');
    expect(wait('12')).toBe('Demasiados intentos. Inténtalo de nuevo en 12 segundos.');
    expect(wait('60')).toBe('Demasiados intentos. Inténtalo de nuevo en 1 minuto.');
    expect(wait('61')).toBe('Demasiados intentos. Inténtalo de nuevo en 2 minutos.');
    expect(wait('900')).toBe('Demasiados intentos. Inténtalo de nuevo en 15 minutos.');
  });

  it('el 429 sin un Retry-After válido no da tiempo', () => {
    const later = 'Demasiados intentos. Inténtalo de nuevo más tarde.';

    expect(problemMessage(httpError(429))).toBe(later);
    expect(problemMessage(httpError(429, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }))).toBe(later);
    expect(problemMessage(httpError(429, { 'Retry-After': '0' }))).toBe(later);
  });
});
