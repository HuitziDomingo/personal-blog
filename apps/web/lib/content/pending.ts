/**
 * Textos en inglés que todavía no tienen versión aprobada por León
 * (ADR-024, punto 8: ningún dato inventado). Mientras tanto, la página en
 * inglés muestra el texto en español. `pending.test.ts` fija la lista
 * completa, así que agregar o resolver uno obliga a actualizarla.
 */
export const PENDING_TRANSLATIONS: string[] = [];

export function pending(spanish: string): string {
  PENDING_TRANSLATIONS.push(spanish);
  return spanish;
}
