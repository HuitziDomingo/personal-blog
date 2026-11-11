import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ACCENTS } from '../src/app/core/theme/theme.ts';
import { checks, composite, contrast, luminance, oklchToLinearSrgb, themes, variablesOf } from './check-theme-contrast.mjs';

const STYLES = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('convierte oklch a sRGB con los extremos y un color conocido', () => {
  assert.deepEqual(oklchToLinearSrgb('oklch(1 0 0)').map((c) => Math.round(c * 1000)), [1000, 1000, 1000]);
  assert.deepEqual(oklchToLinearSrgb('oklch(0 0 0)'), [0, 0, 0]);
  assert.equal(contrast([1, 1, 1], [0, 0, 0]), 21);
  // blue-700 de Tailwind (#1d4ed8) da 6.70 sobre blanco; el recorte al gamut sRGB
  // lo mueve unas centésimas.
  const blue = oklchToLinearSrgb('oklch(0.488 0.243 264.376)');
  assert.ok(Math.abs(contrast(blue, [1, 1, 1]) - 6.7) < 0.2);
});

test('mezcla con opacidad en sRGB codificado, como el navegador', () => {
  // Blanco al 50 % sobre negro: gris #bcbcbc (188) en sRGB, no 50 % lineal.
  const [gray] = composite([1, 1, 1], 0.5, [0, 0, 0]);
  assert.ok(Math.abs(gray - 0.2140) < 0.001);
});

test('las paletas de styles.css son las de theme.ts', () => {
  const { accents } = themes(STYLES);
  assert.deepEqual([...accents].sort(), [...ACCENTS].sort());
});

test('la paleta neutral repite el tema de :root, para que su muestra se vea neutra', () => {
  const neutral = themes(STYLES).themes.filter((theme) => theme.accent === 'neutral');
  const root = variablesOf(STYLES, ':root');
  const base = { light: root, dark: { ...root, ...variablesOf(STYLES, ':root.dark') } };
  for (const mode of ['light', 'dark']) {
    const expected = base[mode];
    const actual = neutral.find((theme) => theme.mode === mode).vars;
    for (const name of ['--primary', '--primary-foreground', '--ring', '--sidebar-primary', '--sidebar-primary-foreground']) {
      assert.equal(actual[name], expected[name], `${mode} ${name}`);
    }
  }
});

test('cada paleta cumple WCAG AA en claro y en oscuro', () => {
  const failures = themes(STYLES)
    .themes.flatMap((theme) =>
      checks(theme)
        .filter((row) => row.ratio < row.min)
        .map((row) => `${theme.accent}/${theme.mode}: ${row.pair} ${row.ratio.toFixed(2)} < ${row.min}`),
    );
  assert.deepEqual(failures, []);
});

test('cada paleta define sus variables en claro y en oscuro', () => {
  for (const { accent, mode, vars } of themes(STYLES).themes) {
    for (const name of ['--primary', '--primary-foreground', '--ring', '--sidebar-primary', '--sidebar-primary-foreground']) {
      assert.ok(vars[name], `${accent}/${mode} no define ${name}`);
    }
  }
});

test('detecta una paleta sin contraste suficiente', () => {
  const css = `${STYLES}\n[data-accent='bad'] { --primary: oklch(0.8 0.1 90); --primary-foreground: oklch(1 0 0); }`;
  const bad = themes(css).themes.find((theme) => theme.accent === 'bad' && theme.mode === 'light');
  const button = checks(bad).find((row) => row.pair.startsWith('Botón'));
  assert.ok(button.ratio < button.min);
});

test('el panel elevado es más oscuro que el fondo en claro y más claro en oscuro', () => {
  for (const { accent, mode, vars } of themes(STYLES).themes) {
    const [panel, background] = ['--panel', '--background'].map((name) => luminance(oklchToLinearSrgb(vars[name])));
    assert.ok(mode === 'light' ? panel < background : panel > background, `${accent}/${mode}`);
  }
});

test('detecta un color de veredicto sin contraste sobre su tinte', () => {
  const css = `${STYLES}\n[data-accent='bad'] { --verdict-approve: oklch(0.8 0.1 150); }`;
  const bad = themes(css).themes.find((theme) => theme.accent === 'bad' && theme.mode === 'light');
  const verdict = checks(bad).find((row) => row.pair.startsWith('Veredicto approve'));
  assert.ok(verdict.ratio < verdict.min);
});
