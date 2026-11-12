import { HttpErrorResponse } from '@angular/common/http';

export type ProblemContext = 'login' | 'post' | 'assistant' | 'comment' | 'generic';

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
      if (context === 'assistant') {
        return 'El asistente no aceptó el borrador. Revisa que tenga contenido y que no sea demasiado largo.';
      }
      if (context === 'comment') {
        return 'No se pudo responder: la respuesta debe tener entre 1 y 2000 caracteres, y solo se responde a comentarios aprobados que no son respuestas.';
      }
      return context === 'login' ? 'Revisa el email y la contraseña.' : 'Revisa los datos enviados.';
    case 401:
      return context === 'login'
        ? 'Email o contraseña incorrectos.'
        : 'Tu sesión expiró. Inicia sesión de nuevo.';
    case 403:
      return 'El servidor rechazó la petición desde este sitio.';
    case 404:
      if (context === 'comment') {
        return 'El comentario ya no existe. Puede que se haya borrado o que la lista haya cambiado.';
      }
      return context === 'post'
        ? 'El post no existe o ya no está disponible.'
        : 'No se encontró lo que buscabas.';
    case 409:
      return context === 'post'
        ? 'El slug ya está en uso o ya no se puede cambiar.'
        : 'La petición choca con el estado actual de los datos.';
    case 413:
      return 'Los datos enviados son demasiado grandes.';
    case 429:
      return tooManyRequests(error.headers.get('Retry-After'), context === 'assistant');
    case 503:
      if (context === 'assistant') {
        return assistantUnavailable(error);
      }
      return context === 'comment' ? moderationUnavailable(error) : UNEXPECTED;
    default:
      return UNEXPECTED;
  }
}

// Retry-After llega en segundos (ADR-010). Si falta, no es un entero positivo
// o es una fecha HTTP, el mensaje no da el tiempo.
function tooManyRequests(retryAfter: string | null, assistant = false): string {
  const prefix = assistant ? 'Pediste demasiadas sugerencias seguidas.' : 'Demasiados intentos.';
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (!Number.isInteger(seconds) || seconds < 1) {
    return `${prefix} Inténtalo de nuevo más tarde.`;
  }

  return `${prefix} Inténtalo de nuevo en ${formatWait(seconds)}.`;
}

// Los `detail` del 503 del asistente (AssistantUnavailable en openapi.yaml,
// que dice que `detail` distingue el caso). Si llega otro, el mensaje es el
// de «no disponible».
const ASSISTANT_DISABLED = 'writing assistant is disabled';
const ASSISTANT_INVALID_OUTPUT = 'writing assistant returned an invalid suggestion, try again';

function assistantUnavailable(error: HttpErrorResponse): string {
  switch (detailOf(error)) {
    case ASSISTANT_DISABLED:
      return 'El asistente está desactivado en la API.';
    case ASSISTANT_INVALID_OUTPUT:
      return 'El asistente devolvió una sugerencia que no cumple las reglas. Inténtalo de nuevo.';
    default:
      return 'El asistente no está disponible ahora (el proveedor falló o agotó su cuota). Inténtalo de nuevo en unos minutos.';
  }
}

// Los `detail` del 503 de la moderación (ModerationUnavailable en
// openapi.yaml). Si llega otro, el mensaje es el de «no disponible».
const MODERATION_DISABLED = 'comment moderation is disabled';

function moderationUnavailable(error: HttpErrorResponse): string {
  return detailOf(error) === MODERATION_DISABLED
    ? 'La moderación con IA está desactivada en la API. Puedes aprobar o rechazar sin análisis.'
    : 'El análisis no está disponible ahora (el modelo falló o agotó su cuota). Inténtalo de nuevo en unos minutos.';
}

function detailOf(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  return typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string'
    ? body.detail
    : '';
}

function formatWait(seconds: number): string {
  if (seconds < 60) {
    return seconds === 1 ? '1 segundo' : `${seconds} segundos`;
  }

  const minutes = Math.ceil(seconds / 60);

  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
