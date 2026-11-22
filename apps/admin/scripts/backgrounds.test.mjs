// Fondos del admin (BLOG-121, BLOG-124): cada imagen de backgrounds.ts existe, pesa como
// mucho 300 KB y tiene sus extremos medidos; y el vidrio de .glass-card en
// styles.css es el que mide check-theme-contrast.mjs (BLOG-143).
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

import { CARD_GLASS_BLUR, CARD_GLASS_BLUR_MEASURED, CARD_GLASS_MIN_ALPHA, CARD_GLASS_SATURATE, cardAlphas } from './check-theme-contrast.mjs';
import { BACKGROUND_ORIENTATIONS, BACKGROUND_VARIANTS, BACKGROUNDS, backgroundPath, thumbnailPath } from '../src/app/core/theme/backgrounds.ts';

const extremes = JSON.parse(readFileSync(new URL('../src/app/core/theme/background-extremes.json', import.meta.url), 'utf8'));

test('cada fondo tiene sus 4 imágenes AVIF de 300 KB o menos, medidas', () => {
  const keys = [];
  for (const id of BACKGROUNDS) {
    for (const variant of BACKGROUND_VARIANTS) {
      for (const orientation of BACKGROUND_ORIENTATIONS) {
        const path = backgroundPath(id, variant, orientation);
        assert.ok(statSync(new URL(`../public/${path}`, import.meta.url)).size <= 300 * 1024, path);
        keys.push(`${id}-${variant}-${orientation}`);
      }
    }
  }
  assert.deepEqual(Object.keys(extremes).sort(), keys.sort());
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
