/**
 * Vidrio selectivo de la web (BLOG-149, prototipo): solo en lo que flota
 * sobre la aurora (cards de posts y de trabajos, saludo de la portada y
 * recuadro de descarga del CV). El cuerpo de los artículos, los bloques de
 * código y los párrafos largos se quedan sobre el fondo de siempre.
 *
 * Los valores viven aquí, sin React ni CSS, para que el test de contraste
 * mida exactamente lo que pinta `.glass` en theme/system.ts:
 *
 * 1. El navegador desenfoca lo que hay detrás (la aurora sobre el lienzo) y
 *    lo satura (`backdrop-filter: blur() saturate()`). El desenfoque solo
 *    promedia: el peor punto sin desenfocar es al menos tan malo como
 *    cualquiera desenfocado, así que el test lo omite (del lado seguro).
 * 2. Encima pinta el tinte (`tint` con opacidad `alpha`).
 */

import { palette } from './brand';

export type GlassMode = 'light' | 'dark';

export const GLASS = {
  /** Desenfoque del backdrop-filter, en px. */
  blur: 20,
  /** Saturación del backdrop-filter (1 = sin cambio). */
  saturate: 1.6,
  /** Tinte encima del fondo filtrado: blanco en claro (vidrio esmerilado, más claro que el lienzo crema) y la superficie de la marca en oscuro. */
  tint: {
    light: { color: '#ffffff', alpha: 0.45 },
    dark: { color: palette.dark.surface, alpha: 0.5 },
  },
  /** Borde claro sutil de 1 px y brillo de 1 px arriba (`rgb(255 255 255 / x)`). */
  edge: {
    light: { border: 0.6, highlight: 0.7 },
    dark: { border: 0.14, highlight: 0.1 },
  },
} as const;

/** Tope de elementos con backdrop-filter visibles a la vez en móvil (cabecera incluida). */
export const GLASS_MAX_VISIBLE = 8;

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

function format(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function toLinear(c: number): number {
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toGamma(c: number): number {
  return c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * Espacio en que el navegador aplica `saturate()`. La especificación de
 * Filter Effects lo define como la matriz de `feColorMatrix`, que por defecto
 * opera en linearRGB; Chromium y WebKit aplican los filtros CSS en sRGB. El
 * test mide los dos y se queda con el peor.
 */
export type FilterSpace = 'srgb' | 'linear';

/** `saturate(amount)` de CSS: la matriz de `feColorMatrix type="saturate"`. */
export function saturate(hex: string, amount: number, space: FilterSpace): string {
  const s = amount;
  const input = parse(hex);
  const [r, g, b] = space === 'linear' ? (input.map(toLinear) as Rgb) : input;
  const out: Rgb = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ];
  const clamped = out.map((v) => Math.min(1, Math.max(0, v))) as Rgb;

  return format(space === 'linear' ? (clamped.map(toGamma) as Rgb) : clamped);
}

/** El color de una superficie de vidrio sobre `backdrop` (sin desenfocar). */
export function glassSurface(backdrop: string, mode: GlassMode, space: FilterSpace): string {
  const filtered = parse(saturate(backdrop, GLASS.saturate, space));
  const { color, alpha } = GLASS.tint[mode];
  const tint = parse(color);

  return format(filtered.map((v, i) => (tint[i] ?? 0) * alpha + v * (1 - alpha)) as Rgb);
}

/**
 * La cabecera fija (components/site-header.tsx): el lienzo al 82 % con
 * `saturate(180%) blur(10px)`. Su texto también va sobre la aurora.
 */
export const HEADER_GLASS = {
  blur: 10,
  saturate: 1.8,
  tint: {
    light: { color: palette.light.bg, alpha: 0.82 },
    dark: { color: palette.dark.bg, alpha: 0.82 },
  },
} as const;

/** Parámetros de una superficie de vidrio: lo que mide `glassBox`. */
export interface GlassSurfaceSpec {
  saturate: number;
  tint: Record<GlassMode, { color: string; alpha: number }>;
}

/** Rango posible de cada canal (0–1): el de `colorBox` de lib/aurora.ts. */
export interface ChannelBox {
  lo: readonly [number, number, number];
  hi: readonly [number, number, number];
}

function saturateMatrix(s: number): number[][] {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

/**
 * El rango de colores de una superficie de vidrio sobre un rango de fondos:
 * `saturate()` (lineal en cada espacio, así que el extremo de cada canal sale
 * de las esquinas de la caja según el signo de cada coeficiente), recorte a
 * 0–1 y el tinte encima. Todo es monótono menos la matriz, que se resuelve
 * por signos: el resultado contiene todos los colores posibles.
 */
export function glassBox(box: ChannelBox, mode: GlassMode, space: FilterSpace, spec: GlassSurfaceSpec = GLASS): ChannelBox {
  const into = space === 'linear' ? toLinear : (c: number) => c;
  const back = space === 'linear' ? toGamma : (c: number) => c;
  const lo = box.lo.map(into);
  const hi = box.hi.map(into);
  const m = saturateMatrix(spec.saturate);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const sat = (pick: 'lo' | 'hi') =>
    m.map((row) => clamp(row.reduce((sum, coef, j) => sum + coef * ((coef >= 0) === (pick === 'lo') ? (lo[j] ?? 0) : (hi[j] ?? 0)), 0)));
  const { color, alpha } = spec.tint[mode];
  const tint = parse(color);
  const tinted = (rgb: number[]) => rgb.map((v, i) => (tint[i] ?? 0) * alpha + back(v) * (1 - alpha)) as unknown as [number, number, number];

  return { lo: tinted(sat('lo')), hi: tinted(sat('hi')) };
}
