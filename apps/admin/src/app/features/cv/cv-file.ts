import { MAX_CV_BYTES } from '../../core/api/cv-api';

/**
 * Revisa en el navegador lo que la API va a rechazar de todos modos: tipo y
 * tamaño (ADR-028, punto 4). Así el error llega antes de subir 2 MB. La firma
 * `%PDF-` la comprueba la API: la extensión y el tipo del archivo los decide
 * el sistema del usuario.
 *
 * Devuelve el mensaje de error, o null si el archivo se puede subir.
 */
export function cvFileProblem(file: File | null): string | null {
  if (!file) {
    return 'Elige un archivo PDF.';
  }

  const looksLikePdf = file.type === 'application/pdf' || (file.type === '' && file.name.toLowerCase().endsWith('.pdf'));
  if (!looksLikePdf) {
    return 'El archivo debe ser un PDF.';
  }

  if (file.size === 0) {
    return 'El archivo está vacío.';
  }

  if (file.size > MAX_CV_BYTES) {
    return `El PDF pesa ${formatSize(file.size)}; el máximo es 2 MB.`;
  }

  return null;
}

/** Tamaño legible: KB por debajo de 1 MB y MB con un decimal por encima. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MB`;
}
