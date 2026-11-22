/**
 * Fondo «aurora» de la web (BLOG-142): manchas cálidas muy desenfocadas abajo
 * y a los costados, que se desplazan despacio. Los datos viven aquí, sin
 * React ni CSS, para que el test de contraste mida exactamente lo que se pinta.
 *
 * - Cada mancha es un `radial-gradient(closest-side, color, transparent)`: ya
 *   nace borrosa, sin `filter: blur()`, así que la animación solo mueve
 *   `transform` y `opacity`, que resuelve el compositor sin repintar.
 * - `alpha` es la opacidad del centro de la mancha con la animación en su
 *   punto más visible (opacity 1): el peor caso para el contraste.
 * - Las manchas de la izquierda nunca llegan a la mitad de la pantalla, ni las
 *   de la derecha (ver `AURORA_MAX_REACH_VW`): como mucho se superponen las
 *   dos de un mismo lado, y ese par es el que mide el test.
 */

export type AuroraSide = 'left' | 'right';

export interface AuroraBlob {
  name: 'ambar' | 'coral' | 'magenta' | 'ambar-claro';
  side: AuroraSide;
  /** `#rrggbb`. */
  color: string;
  alpha: { light: number; dark: number };
  /** Diámetro, en vw. */
  size: number;
  /**
   * Tope del diámetro, en vh: en pantallas muy anchas la mancha no sube hasta
   * la cabecera (su backdrop-filter se recalcularía en cada cuadro). Solo
   * achica, así que no cambia `reachVw`.
   */
  maxSizeVh: number;
  /** Centro horizontal respecto a su borde (negativo: fuera de la pantalla), en vw. */
  inset: number;
  /** Posición vertical del centro, en % del alto visible. */
  top: number;
  /** Duración de un ciclo de ida, en segundos (la animación va y vuelve). */
  duration: number;
  /** Desplazamiento máximo hacia el centro, en vw. */
  drift: number;
  /** Desplazamiento vertical máximo, en vh (negativo: hacia arriba). */
  rise: number;
  /** Escala máxima. */
  scale: number;
}

export const AURORA_BLOBS: readonly AuroraBlob[] = [
  { name: 'ambar', side: 'left', color: '#f5a524', alpha: { light: 0.11, dark: 0.08 }, size: 70, maxSizeVh: 110, inset: -10, top: 92, duration: 31, drift: 6, rise: -6, scale: 1.08 },
  { name: 'coral', side: 'left', color: '#f2795c', alpha: { light: 0.08, dark: 0.07 }, size: 56, maxSizeVh: 90, inset: -14, top: 62, duration: 37, drift: 5, rise: 4, scale: 1.06 },
  { name: 'magenta', side: 'right', color: '#d6408f', alpha: { light: 0.06, dark: 0.08 }, size: 64, maxSizeVh: 100, inset: -12, top: 96, duration: 26, drift: 6, rise: -5, scale: 1.08 },
  { name: 'ambar-claro', side: 'right', color: '#f7b955', alpha: { light: 0.1, dark: 0.07 }, size: 52, maxSizeVh: 84, inset: -12, top: 60, duration: 23, drift: 5, rise: 4, scale: 1.06 },
];

/** Lo más lejos que llega una mancha desde su borde, en vw: radio escalado más desplazamiento. */
export function reachVw(blob: AuroraBlob): number {
  return blob.inset + (blob.size / 2) * blob.scale + blob.drift;
}

/** Ninguna mancha cruza la mitad: las de lados opuestos nunca se superponen. */
export const AURORA_MAX_REACH_VW = 50;

function channel(hex: string, i: number): number {
  return Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

/**
 * El color del fondo con las manchas encima en su centro, a su opacidad
 * máxima (composición «over» en sRGB, como la hace el navegador).
 */
export function composite(bg: string, blobs: readonly AuroraBlob[], mode: 'light' | 'dark'): string {
  let rgb = [0, 1, 2].map((i) => channel(bg, i));
  for (const blob of blobs) {
    const a = blob.alpha[mode];
    rgb = rgb.map((v, i) => v * (1 - a) + channel(blob.color, i) * a);
  }

  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}
