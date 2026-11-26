import { HttpErrorResponse } from '@angular/common/http';

export type ProblemContext = 'login' | 'post' | 'assistant' | 'rag' | 'comment' | 'cv' | 'password' | 'generic';

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
      if (context === 'cv') {
        return 'El archivo no es un PDF válido.';
      }
      if (context === 'password') {
        return passwordRejected(error);
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
      if (context === 'cv') {
        return 'Esa versión del CV ya no existe. Recarga la lista.';
      }
      return context === 'post'
        ? 'El post no existe o ya no está disponible.'
        : 'No se encontró lo que buscabas.';
    case 409:
      return context === 'post'
        ? 'El slug ya está en uso o ya no se puede cambiar.'
        : 'La petición choca con el estado actual de los datos.';
    case 413:
      return context === 'cv' ? 'El PDF pesa más de 2 MB.' : 'Los datos enviados son demasiado grandes.';
    case 429:
      return tooManyRequests(error.headers.get('Retry-After'), context);
    case 503:
      if (context === 'assistant' || context === 'rag') {
        return assistantUnavailable(error);
      }
      if (context === 'cv') {
        return fileStorageUnavailable(error);
      }
      return context === 'comment' ? moderationUnavailable(error) : UNEXPECTED;
    default:
      return UNEXPECTED;
  }
}

// Retry-After llega en segundos (ADR-010). Si falta, no es un entero positivo
// o es una fecha HTTP, el mensaje no da el tiempo.
function tooManyRequests(retryAfter: string | null, context: ProblemContext): string {
  // El reindexado comparte el límite del asistente (ADR-027).
  const prefix =
    context === 'assistant'
      ? 'Pediste demasiadas sugerencias seguidas.'
      : context === 'rag'
        ? 'Hiciste demasiadas peticiones al asistente seguidas.'
        : context === 'password'
          ? 'Demasiados intentos de cambiar la contraseña.'
          : 'Demasiados intentos.';
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
// RagUnavailable en openapi.yaml (ADR-027).
const RAG_DISABLED = 'rag is disabled';

function assistantUnavailable(error: HttpErrorResponse): string {
  switch (detailOf(error)) {
    case ASSISTANT_DISABLED:
      return 'El asistente está desactivado en la API.';
    case ASSISTANT_INVALID_OUTPUT:
      return 'El asistente devolvió una sugerencia que no cumple las reglas. Inténtalo de nuevo.';
    case RAG_DISABLED:
      return 'El contexto de tus posts está desactivado en la API (RAG_ENABLED=false).';
    default:
      return 'El asistente no está disponible ahora (el proveedor falló o agotó su cuota). Inténtalo de nuevo en unos minutos.';
  }
}

// Los `detail` del 400 de changePassword (openapi.yaml, ADR-032). Si llega
// otro, el validador del contrato rechazó el cuerpo.
const PASSWORD_DETAILS: Readonly<Record<string, string>> = {
  'current password is incorrect': 'La contraseña actual no es correcta.',
  'new password must differ from the current one': 'La contraseña nueva debe ser distinta de la actual.',
  'new password is too short': 'La contraseña nueva debe tener al menos 14 caracteres.',
  'new password is too long':
    'La contraseña nueva es demasiado larga: el máximo es 72 bytes, y los acentos y emojis ocupan más de uno.',
};

function passwordRejected(error: HttpErrorResponse): string {
  return (
    PASSWORD_DETAILS[detailOf(error)] ??
    'Revisa los datos: la contraseña nueva debe tener entre 14 y 72 caracteres.'
  );
}

// Los `detail` del 503 de la moderación (ModerationUnavailable en
// openapi.yaml). Si llega otro, el mensaje es el de «no disponible».
const MODERATION_DISABLED = 'comment moderation is disabled';

function moderationUnavailable(error: HttpErrorResponse): string {
  return detailOf(error) === MODERATION_DISABLED
    ? 'La moderación con IA está desactivada en la API. Puedes aprobar o rechazar sin análisis.'
    : 'El análisis no está disponible ahora (el modelo falló o agotó su cuota). Inténtalo de nuevo en unos minutos.';
}

// Los `detail` del 503 del almacenamiento (FileStorageUnavailable en
// openapi.yaml).
const FILE_STORAGE_DISABLED = 'file storage is not configured';

function fileStorageUnavailable(error: HttpErrorResponse): string {
  return detailOf(error) === FILE_STORAGE_DISABLED
    ? 'La API no tiene almacenamiento de archivos configurado (FILES_STORE): no se puede subir el PDF.'
    : 'No se pudo guardar el PDF. Inténtalo de nuevo en unos minutos.';
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
