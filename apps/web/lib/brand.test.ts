import { describe, expect, it } from 'vitest';

import { contrastRatio, glassTeal, palette } from './brand';

/** WCAG 2.1 AA para texto normal. */
const AA = 4.5;

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe.each(['light', 'dark'] as const)('%s palette', (mode) => {
  const c = palette[mode];

  it.each([
    ['fg', c.fg],
    ['muted', c.muted],
    ['link', c.link],
    ['accent', c.accent],
  ])('%s meets AA on the page background and on surfaces', (_name, color) => {
    for (const bg of [c.bg, c.surface]) {
      expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('code text meets AA on the code background', () => {
    expect(contrastRatio(c.fg, c.code)).toBeGreaterThanOrEqual(AA);
  });
});

it('dark text meets AA on the teal buttons', () => {
  expect(contrastRatio(palette.light.fg, glassTeal)).toBeGreaterThanOrEqual(AA);
});
