import { describe, expect, it } from 'vitest';

import { AURORA_BLOBS, type AuroraBlob, composite } from './aurora';
import { contrastRatio, palette } from './brand';
import { GLASS, glassSurface, saturate } from './glass';

/** El lienzo solo y cada combinación de manchas de un mismo lado (las de lados opuestos no se tocan). */
function backdrops(): AuroraBlob[][] {
  const groups: AuroraBlob[][] = [[]];
  for (const side of ['left', 'right'] as const) {
    const blobs = AURORA_BLOBS.filter((b) => b.side === side);
    for (let mask = 1; mask < 1 << blobs.length; mask++) {
      groups.push(blobs.filter((_, i) => mask & (1 << i)));
    }
  }

  return groups;
}

/** Texto de las superficies de vidrio: el de las cards, el saludo y el recuadro del CV. */
const TOKENS = ['fg', 'muted', 'link', 'accent'] as const;

/** Margen sobre 4.5:1: el modelo omite el antialiasing y el redondeo del compositor. */
const AA_WITH_MARGIN = 4.6;

describe('vidrio selectivo (BLOG-149)', () => {
  describe.each(['light', 'dark'] as const)('contraste AA en %s sobre el peor punto de la aurora', (mode) => {
    const colors = palette[mode];

    it.each(backdrops().map((g) => [g.map((b) => b.name).join(' + ') || 'lienzo', g] as const))('%s', (_, group) => {
      const behind = composite(colors.bg, group, mode);
      for (const space of ['srgb', 'linear'] as const) {
        const surface = glassSurface(behind, mode, space);
        for (const token of TOKENS) {
          expect(contrastRatio(colors[token], surface), `${token} sobre ${surface} (${space})`).toBeGreaterThanOrEqual(AA_WITH_MARGIN);
        }
      }
    });
  });

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
});
