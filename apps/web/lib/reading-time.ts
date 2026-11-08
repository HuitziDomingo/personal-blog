/** Palabras por minuto de lectura en español, una media habitual. */
export const WORDS_PER_MINUTE = 200;

/** Minutos estimados de lectura del Markdown de un post; como mínimo 1. */
export function readingMinutes(markdown: string): number {
  const text = markdown
    // La URL de imágenes y links no se lee: se queda el texto visible.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ');
  const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function formatReadingTime(minutes: number): string {
  return `${String(minutes)} min de lectura`;
}
