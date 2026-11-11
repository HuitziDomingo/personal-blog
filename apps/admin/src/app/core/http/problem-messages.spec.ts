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
    expect(problemMessage(httpError(404))).toBe('No se encontró lo que buscabas.');
    expect(problemMessage(httpError(404), 'post')).toBe('El post no existe o ya no está disponible.');
    expect(problemMessage(httpError(409))).toBe('La petición choca con el estado actual de los datos.');
    expect(problemMessage(httpError(409), 'post')).toBe('El slug ya está en uso o ya no se puede cambiar.');
    expect(problemMessage(httpError(400), 'post')).toBe('Revisa los datos enviados.');
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

  describe('asistente', () => {
    const unavailable = (detail?: string) =>
      problemMessage(new HttpErrorResponse({ status: 503, error: detail === undefined ? null : { status: 503, detail } }), 'assistant');

    it('distingue los 503 por el detail del problem', () => {
      expect(unavailable('writing assistant is disabled')).toBe('El asistente está desactivado en la API.');
      expect(unavailable('writing assistant returned an invalid suggestion, try again')).toBe(
        'El asistente devolvió una sugerencia que no cumple las reglas. Inténtalo de nuevo.',
      );
      const notAvailable =
        'El asistente no está disponible ahora (el proveedor falló o agotó su cuota). Inténtalo de nuevo en unos minutos.';
      expect(unavailable('writing assistant is unavailable, try again later')).toBe(notAvailable);
      expect(unavailable('something new')).toBe(notAvailable);
      expect(unavailable()).toBe(notAvailable);
    });

    it('el 429 dice que fueron demasiadas sugerencias y cuánto esperar', () => {
      expect(problemMessage(httpError(429, { 'Retry-After': '30' }), 'assistant')).toBe(
        'Pediste demasiadas sugerencias seguidas. Inténtalo de nuevo en 30 segundos.',
      );
      expect(problemMessage(httpError(429), 'assistant')).toBe('Pediste demasiadas sugerencias seguidas. Inténtalo de nuevo más tarde.');
    });

    it('el 400 explica qué revisar; fuera del asistente, el 503 sigue siendo inesperado', () => {
      expect(problemMessage(httpError(400), 'assistant')).toBe(
        'El asistente no aceptó el borrador. Revisa que tenga contenido y que no sea demasiado largo.',
      );
      expect(problemMessage(httpError(503))).toBe('Error inesperado del servidor. Inténtalo de nuevo.');
    });
  });
});
