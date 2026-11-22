/**
 * Auditoría de contraste de la aurora (BLOG-150): el peor contraste de cada
 * color de texto sobre cada superficie donde puede quedar encima de la aurora
 * (el lienzo, las cards de vidrio y la cabecera), en cada pantalla de
 * `AURORA_VIEWPORTS` y en cada punto de su rejilla. La usa el test y el
 * script que ajusta los alfas; no se importa desde la página.
 */

import { AURORA_VIEWPORTS, type AuroraMode, colorBox, gridPoints, parseHex } from './aurora';
import { palette } from './brand';
import { GLASS, glassBox, HEADER_GLASS, type ChannelBox } from './glass';

export const TEXT_TOKENS = ['fg', 'muted', 'link', 'accent'] as const;
export type TextToken = (typeof TEXT_TOKENS)[number];

export const SURFACES = ['lienzo', 'vidrio', 'cabecera'] as const;
export type Surface = (typeof SURFACES)[number];

function channel(c: number): number {
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly number[]): number {
  return 0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0);
}

/**
 * El menor contraste WCAG entre `text` y cualquier color de la caja. El
 * contraste baja al acercarse la luminancia del fondo a la del texto, así que
 * el mínimo está en uno de los extremos de luminancia de la caja (o es 1 si
 * la del texto cae dentro).
 */
export function worstContrast(text: string, box: ChannelBox): number {
  const t = luminance(parseHex(text));
  const lo = luminance(box.lo);
  const hi = luminance(box.hi);
  if (t >= lo && t <= hi) return 1;
  const ratio = (l: number) => (Math.max(t, l) + 0.05) / (Math.min(t, l) + 0.05);

  return Math.min(ratio(lo), ratio(hi));
}

/** Los rangos de color de cada superficie en un punto del lienzo. */
export function surfaceBoxes(box: ChannelBox, mode: AuroraMode): Record<Surface, ChannelBox[]> {
  return {
    lienzo: [box],
    // saturate() en sRGB (Chromium, WebKit) y en linearRGB (la especificación).
    vidrio: [glassBox(box, mode, 'srgb', GLASS), glassBox(box, mode, 'linear', GLASS)],
    cabecera: [glassBox(box, mode, 'srgb', HEADER_GLASS), glassBox(box, mode, 'linear', HEADER_GLASS)],
  };
}

export interface Worst {
  ratio: number;
  /** Pantalla y punto, en px. */
  where: string;
}

export type Audit = Record<Surface, Record<TextToken, Worst>>;

/** El peor contraste de cada texto en cada superficie, en las pantallas dadas. */
export function auditAurora(mode: AuroraMode, viewports = AURORA_VIEWPORTS): Audit {
  const colors = palette[mode];
  const audit = Object.fromEntries(
    SURFACES.map((s) => [s, Object.fromEntries(TEXT_TOKENS.map((t) => [t, { ratio: Infinity, where: '' }]))]),
  ) as Audit;

  for (const [w, h] of viewports) {
    for (const [px, py] of gridPoints(w, h)) {
      const boxes = surfaceBoxes(colorBox(colors.bg, mode, px, py, w, h), mode);
      for (const surface of SURFACES) {
        for (const token of TEXT_TOKENS) {
          for (const box of boxes[surface]) {
            const ratio = worstContrast(colors[token], box);
            if (ratio < audit[surface][token].ratio) {
              audit[surface][token] = { ratio, where: `${String(w)}×${String(h)} en (${String(Math.round(px))}, ${String(Math.round(py))})` };
            }
          }
        }
      }
    }
  }

  return audit;
}
