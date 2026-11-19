// Fondos del admin (BLOG-121, BLOG-124): cada imagen de backgrounds.ts existe, pesa como
// mucho 300 KB y tiene sus extremos medidos; y el tinte de .glass-card en
// styles.css es el mismo que mide check-theme-contrast.mjs.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

import { CARD_GLASS_ALPHA } from './check-theme-contrast.mjs';
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

test('el tinte de .glass-card es el que se mide', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const match = /\.glass-card \{[^}]*var\(--glass-tint\) (\d+)%/.exec(css);
  assert.ok(match, 'no encuentro el tinte de .glass-card');
  assert.equal(Number(match[1]) / 100, CARD_GLASS_ALPHA);
});
