// Prueba el script inline de src/index.html que aplica el tema antes de que
// arranque Angular. Lo ejecuta con fakes de document, localStorage y
// matchMedia, y lo compara con las listas de theme.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BACKGROUND_STORAGE_KEY, BACKGROUNDS, DEFAULT_BACKGROUND } from '../src/app/core/theme/backgrounds.ts';
import { ACCENTS, THEME_STORAGE_KEYS } from '../src/app/core/theme/theme.ts';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map(([, body]) => body);

function run({ stored = {}, systemDark = false, storageThrows = false, path = '/posts', random = 0 } = {}) {
  const classes = new Set();
  const attributes = {};
  const root = {
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    setAttribute: (name, value) => (attributes[name] = value),
  };
  const localStorage = {
    getItem(key) {
      if (storageThrows) {
        throw new Error('SecurityError');
      }
      return stored[key] ?? null;
    },
  };
  const matchMedia = (query) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark });
  const window = { matchMedia };
  const preloads = [];
  const document = {
    documentElement: root,
    head: { appendChild: (link) => preloads.push(link) },
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
  };
  const math = Object.create(Math, { random: { value: () => random } });

  new Function('document', 'window', 'localStorage', 'matchMedia', 'location', 'Math', scripts[0])(
    document,
    window,
    localStorage,
    matchMedia,
    { pathname: path },
    math,
  );

  return {
    dark: classes.has('dark'),
    accent: attributes['data-accent'],
    loginBackground: attributes['data-login-background'],
    preloads: preloads.map(({ rel, as, type, media, href, fetchpriority }) => ({ rel, as, type, media, href, fetchpriority })),
  };
}

test('index.html tiene un solo script inline, el del tema y el fondo', () => {
  assert.equal(scripts.length, 1);
  for (const key of Object.values(THEME_STORAGE_KEYS)) {
    assert.ok(scripts[0].includes(`'${key}'`), `el script no lee ${key}`);
  }
});

test('aplica el modo guardado', () => {
  assert.equal(run({ stored: { 'admin-theme': 'dark' } }).dark, true);
  assert.equal(run({ stored: { 'admin-theme': 'light' }, systemDark: true }).dark, false);
});

test('sin preferencia, o con "system", sigue al sistema', () => {
  assert.equal(run({ systemDark: true }).dark, true);
  assert.equal(run({ systemDark: false }).dark, false);
  assert.equal(run({ stored: { 'admin-theme': 'system' }, systemDark: true }).dark, true);
});

test('acepta cada acento de theme.ts y nada más', () => {
  for (const accent of ACCENTS) {
    assert.equal(run({ stored: { 'admin-accent': accent } }).accent, accent);
  }
  assert.equal(run({ stored: { 'admin-accent': 'javascript:alert(1)' } }).accent, 'neutral');
  assert.equal(run().accent, 'neutral');
});

test('ignora un modo inválido', () => {
  assert.equal(run({ stored: { 'admin-theme': 'sepia' }, systemDark: true }).dark, true);
});

test('si localStorage falla, usa el tema del sistema', () => {
  const result = run({ storageThrows: true, systemDark: true });
  assert.equal(result.dark, true);
  assert.equal(result.accent, 'neutral');
  assert.equal(result.preloads[0].href, `backgrounds/${DEFAULT_BACKGROUND}-dark-portrait.avif`);
});

test('el script usa la misma lista de fondos y la misma clave que backgrounds.ts', () => {
  assert.ok(scripts[0].includes(`var backgrounds = ${JSON.stringify(BACKGROUNDS).replaceAll('"', "'").replaceAll(',', ', ')};`));
  assert.ok(scripts[0].includes(`'${BACKGROUND_STORAGE_KEY}'`));
  assert.ok(scripts[0].includes(`background = '${DEFAULT_BACKGROUND}'`));
});

test('fuera del login precarga el fondo guardado, en el tema actual, con los dos recortes por media', () => {
  const { preloads, loginBackground } = run({ stored: { 'admin-background': 'map', 'admin-theme': 'dark' } });
  assert.equal(loginBackground, undefined);
  assert.deepEqual(preloads, [
    { rel: 'preload', as: 'image', type: 'image/avif', media: '(orientation: portrait)', href: 'backgrounds/map-dark-portrait.avif', fetchpriority: 'high' },
    { rel: 'preload', as: 'image', type: 'image/avif', media: 'not all and (orientation: portrait)', href: 'backgrounds/map-dark-landscape.avif', fetchpriority: 'high' },
  ]);
});

test('un fondo guardado inválido cae al de por defecto', () => {
  const { preloads } = run({ stored: { 'admin-background': '../../x' } });
  assert.equal(preloads[1].href, `backgrounds/${DEFAULT_BACKGROUND}-light-landscape.avif`);
});

test('en /login elige uno al azar, lo marca en <html> y precarga solo ese', () => {
  for (const [index, background] of BACKGROUNDS.entries()) {
    const random = (index + 0.5) / BACKGROUNDS.length;
    const result = run({ path: '/login', random, stored: { 'admin-background': 'fold' } });
    assert.equal(result.loginBackground, background);
    assert.deepEqual(result.preloads.map((link) => link.href), [
      `backgrounds/${background}-light-portrait.avif`,
      `backgrounds/${background}-light-landscape.avif`,
    ]);
  }
});
