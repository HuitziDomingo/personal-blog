import { describe, expect, it } from 'vitest';

import {
  AURORA_BLOBS,
  AURORA_KEYFRAMES,
  AURORA_MOBILE_MAX_PX,
  AURORA_VIEWPORTS,
  alphaFor,
  blobState,
  colorBox,
  easeInOut,
  gridPoints,
  maxCoverage,
  parseHex,
  visibleBlobs,
} from './aurora';
import { auditAurora, SURFACES, TEXT_TOKENS, worstContrast } from './aurora-contrast';
import { palette } from './brand';

/** Margen sobre 4.5:1: el modelo omite el antialiasing y el redondeo del compositor. */
const AA_WITH_MARGIN = 4.6;

describe('fondo aurora v2 (BLOG-150)', () => {
  it('5 manchas en escritorio y 3 en móvil, con ciclos de 15 a 30 s', () => {
    expect(visibleBlobs(1440)).toHaveLength(5);
    expect(visibleBlobs(390)).toHaveLength(3);
    expect(visibleBlobs(AURORA_MOBILE_MAX_PX)).toHaveLength(5);
    for (const blob of AURORA_BLOBS) {
      expect(blob.duration).toBeGreaterThanOrEqual(15);
      expect(blob.duration).toBeLessThanOrEqual(30);
    }
  });

  it('se desplazan de 10 a 15 vw', () => {
    for (const blob of AURORA_BLOBS) {
      expect(Math.abs(blob.drift)).toBeGreaterThanOrEqual(10);
      expect(Math.abs(blob.drift)).toBeLessThanOrEqual(15);
    }
  });

  it('los tonos son ámbar, coral, magenta y violeta, sin cambio de tono (BLOG-151)', () => {
    const tones = new Set(AURORA_BLOBS.map((b) => b.tone.name));
    expect([...tones].sort()).toEqual(['ambar', 'coral', 'magenta', 'violeta']);
  });

  it('el alfa en claro llega a la meta de 0,30 a 0,50 (BLOG-151)', () => {
    for (const blob of AURORA_BLOBS) {
      for (const alpha of [blob.alpha.light, blob.alpha.mobileLight]) {
        expect(alpha).toBeGreaterThanOrEqual(0.3);
        expect(alpha).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('las manchas se cruzan: al menos un par de lados opuestos se superpone', () => {
    const [w, h] = [1440, 900];
    const left = visibleBlobs(w).filter((b) => b.x < 50);
    const right = visibleBlobs(w).filter((b) => b.x > 50);
    const crosses = gridPoints(w, h).some(
      ([px, py]) => left.some((b) => maxCoverage(b, px, py, w, h) > 0) && right.some((b) => maxCoverage(b, px, py, w, h) > 0),
    );
    expect(crosses).toBe(true);
  });

  /** Suma de alfas que pueden llegar a un punto: una medida de intensidad. */
  function intensity(px: number, py: number, w: number, h: number): number {
    return visibleBlobs(w).reduce((sum, b) => sum + maxCoverage(b, px, py, w, h) * alphaFor(b, 'light', w), 0);
  }

  it.each(AURORA_VIEWPORTS.map(([w, h]) => [`${String(w)}×${String(h)}`, w, h] as const))(
    'en %s, la zona superior central queda más limpia que abajo y los costados',
    (_, w, h) => {
      const topCenter = intensity(w / 2, h * 0.15, w, h);
      const edges = [intensity(w * 0.05, h * 0.9, w, h), intensity(w * 0.95, h * 0.9, w, h), intensity(w / 2, h, w, h)];
      for (const edge of edges) expect(topCenter).toBeLessThan(edge / 2);
    },
  );

  describe.each(['light', 'dark'] as const)('contraste AA en %s sobre el peor punto de cada pantalla', (mode) => {
    const audit = auditAurora(mode);

    for (const surface of SURFACES) {
      it.each(TEXT_TOKENS.map((t) => [t] as const))(`${surface}: %s`, (token) => {
        const worst = audit[surface][token];
        expect(worst.ratio, `${token} en ${surface}, ${worst.where}`).toBeGreaterThanOrEqual(AA_WITH_MARGIN);
      });
    }
  });

  describe('modelo', () => {
    it('ease-in-out de CSS: simétrica, de 0 a 1', () => {
      expect(easeInOut(0)).toBeCloseTo(0);
      expect(easeInOut(1)).toBeCloseTo(1);
      expect(easeInOut(0.5)).toBeCloseTo(0.5);
      expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1);
    });

    it('la opacidad sigue los keyframes: 0 %, 50 % y 100 %', () => {
      expect(blobState(0).opacity).toBeCloseTo(AURORA_KEYFRAMES.start);
      expect(blobState(0.5).opacity).toBeCloseTo(AURORA_KEYFRAMES.peak);
      expect(blobState(1).opacity).toBeCloseTo(AURORA_KEYFRAMES.end);
    });

    it('en el centro en reposo, la mancha llega con todo su alfa (reduced-motion)', () => {
      const [blob] = AURORA_BLOBS;
      if (!blob) throw new Error('sin manchas');
      const [w, h] = [1440, 900];
      expect(maxCoverage(blob, (blob.x * w) / 100, (blob.y * h) / 100, w, h)).toBeCloseTo(1);
    });

    it('lejos de todas las manchas, el color es el del lienzo', () => {
      const box = colorBox('#f0e7db', 'light', -5000, -5000, 1440, 900);
      expect(box.lo).toEqual(parseHex('#f0e7db'));
      expect(box.hi).toEqual(parseHex('#f0e7db'));
    });

    it('worstContrast toma el extremo de la caja más cercano al texto', () => {
      const white = parseHex('#ffffff');
      const black = parseHex('#000000');
      expect(worstContrast('#000000', { lo: white, hi: white })).toBeCloseTo(21);
      expect(worstContrast('#000000', { lo: black, hi: white })).toBe(1);
      expect(worstContrast(palette.light.fg, { lo: parseHex(palette.light.bg), hi: white })).toBeCloseTo(
        worstContrast(palette.light.fg, { lo: parseHex(palette.light.bg), hi: parseHex(palette.light.bg) }),
      );
    });
  });
});
