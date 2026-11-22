import { describe, expect, it } from 'vitest';

import { parseHex } from './aurora';
import { GLASS, glassBox, glassSurface, HEADER_GLASS, saturate } from './glass';

// El contraste del texto sobre el vidrio, encima de la aurora, lo mide
// lib/aurora.test.ts con glassBox en cada punto de cada pantalla.

describe('vidrio selectivo (BLOG-149)', () => {
  it('saturate(1) no cambia el color, en los dos espacios', () => {
    expect(saturate('#f0e7db', 1, 'srgb')).toBe('#f0e7db');
    expect(saturate('#f0e7db', 1, 'linear')).toBe('#f0e7db');
  });

  it('saturate(0) en sRGB da el gris de la matriz de la especificación', () => {
    // 0.213 · 1 + 0.715 · 0 + 0.072 · 0 = 0.213 → 54.
    expect(saturate('#ff0000', 0, 'srgb')).toBe('#363636');
  });

  it('el tinte es semitransparente: el vidrio deja ver la aurora', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(GLASS.tint[mode].alpha).toBeGreaterThan(0);
      expect(GLASS.tint[mode].alpha).toBeLessThan(1);
    }
  });

  describe.each(['srgb', 'linear'] as const)('glassBox contiene cada vidrio posible (%s)', (space) => {
    const box = { lo: parseHex('#c08040'), hi: parseHex('#ffe0d0') };
    const inside = ['#c08040', '#ffe0d0', '#c0e0d0', '#ff8040', '#e0b090', '#d09fcf'];

    it.each(['light', 'dark'] as const)('%s', (mode) => {
      const out = glassBox(box, mode, space);
      for (const hex of inside) {
        const surface = parseHex(glassSurface(hex, mode, space));
        for (let c = 0; c < 3; c++) {
          // Un paso de 8 bits de tolerancia: glassSurface redondea a hex dos veces.
          expect(surface[c]).toBeGreaterThanOrEqual((out.lo[c] ?? 0) - 1 / 255);
          expect(surface[c]).toBeLessThanOrEqual((out.hi[c] ?? 1) + 1 / 255);
        }
      }
    });
  });

  it('la cabecera también es vidrio: más tinte, menos desenfoque', () => {
    expect(HEADER_GLASS.tint.light.alpha).toBeGreaterThan(GLASS.tint.light.alpha);
    expect(HEADER_GLASS.blur).toBeLessThan(GLASS.blur);
  });
});
