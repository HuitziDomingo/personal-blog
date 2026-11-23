import { describe, expect, it } from 'vitest';

import {
  AURORA_BLOBS,
  AURORA_GLOW_ALPHA,
  AURORA_GLOW_MAX_VH,
  AURORA_GLOW_OVALS,
  AURORA_GRAIN,
  AURORA_KEYFRAMES,
  AURORA_MOBILE_MAX_PX,
  AURORA_VIEWPORTS,
  FALLOFF,
  alphaFor,
  blobState,
  colorBox,
  easeInOut,
  falloff,
  falloffCss,
  glowGradient,
  glowToneVars,
  glowCoverage,
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

  describe('aurora v3 (BLOG-156)', () => {
    it('la caída tiene 9 paradas, de 1 a 0, decreciente y plana en el centro y en el borde', () => {
      expect(FALLOFF).toHaveLength(9);
      expect(FALLOFF[0]).toEqual([0, 1]);
      expect(FALLOFF.at(-1)).toEqual([1, 0]);
      for (let i = 1; i < FALLOFF.length; i++) expect(FALLOFF[i]?.[1]).toBeLessThan(FALLOFF[i - 1]?.[1] ?? 0);
      // Pendiente cero en los extremos: sin borde ni anillo.
      expect(1 - falloff(0.01)).toBeLessThan(0.001);
      expect(falloff(0.99)).toBeLessThan(0.0001);
      expect(falloffCss(0.5)).toBeCloseTo(falloff(0.5), 3);
    });

    it('el resplandor se queda en los primeros 45 vh de cada pantalla', () => {
      for (const [w, h] of AURORA_VIEWPORTS) {
        for (const oval of AURORA_GLOW_OVALS) {
          for (let x = 0; x <= w; x += w / 24) {
            expect(glowCoverage(oval, x, (h * AURORA_GLOW_MAX_VH) / 100, w, h)).toBe(0);
          }
        }
      }
    });

    it('el resplandor de la variante B: 0,42 en claro y 0,32 en oscuro', () => {
      expect(AURORA_GLOW_ALPHA).toEqual({ light: 0.42, dark: 0.32, mobileLight: 0.42, mobileDark: 0.32 });
    });

    it('el resplandor se escribe una vez, con una parada por punto de la caída', () => {
      const css = glowGradient();
      expect(css.match(/radial-gradient/g)).toHaveLength(AURORA_GLOW_OVALS.length);
      expect(css.match(/var\(--aurora-glow-alpha\)/g)).toHaveLength(AURORA_GLOW_OVALS.length * FALLOFF.length);
      expect(Object.keys(glowToneVars('dark'))).toHaveLength(AURORA_GLOW_OVALS.length);
    });

    it('el grano pesa menos de 15 KB y es el que genera el script', async () => {
      const { grainPng } = await import('../scripts/build-grain');
      const { readFileSync } = await import('node:fs');
      const file = readFileSync(new URL(`../public${AURORA_GRAIN.src}`, import.meta.url));
      expect(file.length).toBeLessThanOrEqual(15 * 1024);
      expect(file.equals(grainPng())).toBe(true);
      expect(file.readUInt32BE(16)).toBe(AURORA_GRAIN.size);
    });
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

    it('lejos de todas las manchas y del resplandor, el color es el del lienzo con el grano', () => {
      const box = colorBox('#f0e7db', 'light', -5000, -5000, 1440, 900);
      const o = AURORA_GRAIN.opacity.light;
      parseHex('#f0e7db').forEach((c, i) => {
        expect(box.lo[i as 0]).toBeCloseTo(c * (1 - o));
        expect(box.hi[i as 0]).toBeCloseTo(c * (1 - o) + o);
      });
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
