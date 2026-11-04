import { HttpErrorResponse } from '@angular/common/http';

export type ProblemContext = 'login' | 'generic';

const UNEXPECTED = 'Error inesperado del servidor. Inténtalo de nuevo.';

/**
 * Traduce un error de la API a un mensaje en español. La API responde
 * problem+json en inglés (CLAUDE.md); el mensaje se decide por el estado HTTP.
 */
export function problemMessage(error: unknown, context: ProblemContext = 'generic'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return UNEXPECTED;
  }

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    case 400:
      return context === 'login' ? 'Revisa el email y la contraseña.' : 'Revisa los datos enviados.';
    case 401:
      return context === 'login'
        ? 'Email o contraseña incorrectos.'
        : 'Tu sesión expiró. Inicia sesión de nuevo.';
    case 403:
      return 'El servidor rechazó la petición desde este sitio.';
    case 413:
      return 'Los datos enviados son demasiado grandes.';
    case 429:
      return tooManyRequests(error.headers.get('Retry-After'));
    default:
      return UNEXPECTED;
  }
}

// Retry-After llega en segundos (ADR-010). Si falta, no es un entero positivo
// o es una fecha HTTP, el mensaje no da el tiempo.
function tooManyRequests(retryAfter: string | null): string {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (!Number.isInteger(seconds) || seconds < 1) {
    return 'Demasiados intentos. Inténtalo de nuevo más tarde.';
  }

  return `Demasiados intentos. Inténtalo de nuevo en ${formatWait(seconds)}.`;
}

function formatWait(seconds: number): string {
  if (seconds < 60) {
    return seconds === 1 ? '1 segundo' : `${seconds} segundos`;
  }

  const minutes = Math.ceil(seconds / 60);

  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
