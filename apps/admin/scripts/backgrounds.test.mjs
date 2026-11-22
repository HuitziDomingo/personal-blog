// Fondos del admin (BLOG-121, BLOG-124, BLOG-146): cada variante de backgrounds.ts existe
// en AVIF y WebP, sin pasar del límite de su formato, y cada fondo tiene sus extremos medidos; y el vidrio de .glass-card en
// styles.css es el que mide check-theme-contrast.mjs (BLOG-143).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CARD_GLASS_BLUR, CARD_GLASS_BLUR_MEASURED, CARD_GLASS_MIN_ALPHA, CARD_GLASS_SATURATE, cardAlphas } from './check-theme-contrast.mjs';
import {
  BACKGROUND_FORMATS,
  BACKGROUND_MAX_WIDTHS,
  BACKGROUND_ORIENTATIONS,
  BACKGROUND_VARIANTS,
  BACKGROUNDS,
  backgroundPath,
  backgroundSrcset,
  backgroundWidths,
  maxCropWidth,
  thumbnailPath,
} from '../src/app/core/theme/backgrounds.ts';

const extremes = JSON.parse(readFileSync(new URL('../src/app/core/theme/background-extremes.json', import.meta.url), 'utf8'));

/** Límite por archivo: la de 3840 de un fondo con grano fino es la que más pesa. */
const MAX_BYTES = { avif: 1536 * 1024, webp: 1024 * 1024 };
/** Firma de cada formato: `ftypavif` en el byte 4 y `WEBP` en el 8. */
const SIGNATURES = { avif: [4, 'ftypavif'], webp: [8, 'WEBP'] };

test('cada fondo tiene cada variante en AVIF y WebP, sin pasar del límite, y sus extremos medidos (BLOG-146)', () => {
  const keys = [];
  const expected = new Set(['CREDITS.md']);
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      expected.add(thumbnailPath(id, variant).replace('backgrounds/', ''));
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        for (const format of BACKGROUND_FORMATS) {
          for (const width of backgroundWidths(id, orientation, format)) {
            const path = backgroundPath(id, variant, orientation, width, format);
            expected.add(path.replace('backgrounds/', ''));
            const bytes = readFileSync(new URL(`../public/${path}`, import.meta.url));
            assert.ok(bytes.length <= MAX_BYTES[format], `${path}: ${bytes.length} B`);
            const [offset, signature] = SIGNATURES[format];
            assert.equal(bytes.subarray(offset, offset + signature.length).toString('ascii'), signature, path);
          }
        }
        keys.push(`${id}-${variant}-${orientation}`);
      }
    }
  }
  assert.deepEqual(Object.keys(extremes).sort(), keys.sort());
  // Ni archivos de más (variantes viejas) ni de menos.
  assert.deepEqual(readdirSync(new URL('../public/backgrounds/', import.meta.url)).sort(), [...expected].sort());
});

test('los anchos no amplían el original y llegan al máximo de cada formato cuando el original alcanza (BLOG-146, BLOG-147)', () => {
  for (const id of BACKGROUNDS) {
    for (const orientation of BACKGROUND_ORIENTATIONS) {
      for (const format of BACKGROUND_FORMATS) {
        const widths = backgroundWidths(id, orientation, format);
        const key = `${id}-${orientation}-${format}`;
        assert.equal(widths[0], 1280, key);
        assert.equal(widths.at(-1), Math.min(BACKGROUND_MAX_WIDTHS[format], maxCropWidth(id, orientation)), key);
        assert.deepEqual([...widths].sort((a, b) => a - b), widths, key);
        assert.equal(new Set(widths).size, widths.length, key);
      }
    }
  }
  assert.deepEqual(BACKGROUND_MAX_WIDTHS, { avif: 3840, webp: 2560 });
});

test('cada srcset de los 15 fondos apunta a archivos que existen, AVIF hasta 3840 y WebP hasta 2560 (BLOG-147)', () => {
  assert.equal(BACKGROUNDS.length, 15);
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        for (const format of BACKGROUND_FORMATS) {
          const candidates = backgroundSrcset(id, variant, orientation, format)
            .split(', ')
            .map((candidate) => candidate.split(' '));
          assert.ok(candidates.length >= 2, `${id}-${variant}-${orientation}-${format}`);
          for (const [path, descriptor] of candidates) {
            assert.ok(existsSync(new URL(`../public/${path}`, import.meta.url)), `no existe ${path}`);
            assert.ok(path.endsWith(`.${format}`), path);
            const width = Number(/^(\d+)w$/.exec(descriptor)?.[1]);
            assert.ok(width <= BACKGROUND_MAX_WIDTHS[format], `${path} ${descriptor}`);
            assert.ok(path.endsWith(`-${width}.${format}`), `${path} ${descriptor}`);
          }
        }
      }
    }
  }
});

test('cada fondo tiene su miniatura webp de cada versión, de 16 KB o menos (BLOG-124)', () => {
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      const path = thumbnailPath(id, variant);
      const bytes = readFileSync(new URL(`../public/${path}`, import.meta.url));
      assert.ok(bytes.length <= 16 * 1024, path);
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', path);
    }
  }
});

test('el filtro de .glass-card es el que se mide, con menos desenfoque', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const card = /\n\.glass-card \{([^}]*)\}/.exec(css)?.[1];
  assert.ok(card, 'no encuentro .glass-card');
  assert.match(card, /background: color-mix\(in srgb, var\(--glass-tint\) var\(--glass-card-alpha\), transparent\);/);
  for (const property of ['-webkit-backdrop-filter', 'backdrop-filter']) {
    const filter = new RegExp(`\\n\\s*${property}: blur\\((\\d+)px\\) saturate\\(([\\d.]+)\\);`).exec(card);
    assert.ok(filter, property);
    assert.equal(Number(filter[1]), CARD_GLASS_BLUR, property);
    assert.equal(Number(filter[2]), CARD_GLASS_SATURATE, property);
  }
  assert.ok(CARD_GLASS_BLUR_MEASURED < CARD_GLASS_BLUR);
});

test('cada fondo tiene su tinte de card en claro y en oscuro, no menor que el mínimo', () => {
  const alphas = cardAlphas(readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'));
  for (const variant of BACKGROUND_VARIANTS) {
    assert.deepEqual(Object.keys(alphas[variant].backdrops).sort(), [...BACKGROUNDS].sort(), variant);
    for (const [id, alpha] of Object.entries(alphas[variant].backdrops)) {
      assert.ok(alpha >= CARD_GLASS_MIN_ALPHA && alpha <= 1, `${id}-${variant}: ${alpha}`);
    }
  }
});
