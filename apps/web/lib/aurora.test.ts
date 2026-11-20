import { describe, expect, it } from 'vitest';

import { AURORA_BLOBS, AURORA_MAX_REACH_VW, type AuroraBlob, composite, reachVw } from './aurora';
import { contrastRatio, palette } from './brand';

/** Todas las combinaciones no vacías de manchas de un mismo lado. */
function sameSideGroups(): AuroraBlob[][] {
  const groups: AuroraBlob[][] = [];
  for (const side of ['left', 'right'] as const) {
    const blobs = AURORA_BLOBS.filter((b) => b.side === side);
    for (let mask = 1; mask < 1 << blobs.length; mask++) {
      groups.push(blobs.filter((_, i) => mask & (1 << i)));
    }
  }

  return groups;
}

describe('fondo aurora (BLOG-142)', () => {
  it('3 o 4 manchas cálidas, con ciclos de 20 a 40 s', () => {
    expect(AURORA_BLOBS.length).toBeGreaterThanOrEqual(3);
    expect(AURORA_BLOBS.length).toBeLessThanOrEqual(4);
    for (const blob of AURORA_BLOBS) {
      expect(blob.duration).toBeGreaterThanOrEqual(20);
      expect(blob.duration).toBeLessThanOrEqual(40);
    }
  });

  it.each(AURORA_BLOBS.map((b) => [b.name, b] as const))('%s no cruza la mitad de la pantalla: no se superpone con las del otro lado', (_, blob) => {
    expect(reachVw(blob)).toBeLessThan(AURORA_MAX_REACH_VW);
  });

  describe.each(['light', 'dark'] as const)('contraste AA en %s sobre el peor punto', (mode) => {
    const colors = palette[mode];
    const tokens = ['fg', 'muted', 'link', 'accent'] as const;

    it.each(sameSideGroups().map((g) => [g.map((b) => b.name).join(' + '), g] as const))('%s', (_, group) => {
      const bg = composite(colors.bg, group, mode);
      for (const token of tokens) {
        expect(contrastRatio(colors[token], bg), `${token} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  it('composite mezcla en sRGB como el navegador', () => {
    const [first] = AURORA_BLOBS;
    if (!first) throw new Error('sin manchas');
    const blob = { ...first, color: '#ffffff', alpha: { light: 0.5, dark: 0.5 } };

    expect(composite('#000000', [blob], 'light')).toBe('#808080');
  });
});
