// Prueba el script inline de src/index.html que aplica el tema antes de que
// arranque Angular. Lo ejecuta con fakes de document, localStorage y
// matchMedia, y lo compara con las listas de theme.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BACKGROUNDS } from '../src/app/core/theme/backgrounds.ts';
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
    preloads,
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
});

test('el script usa la misma lista de fondos que backgrounds.ts', () => {
  assert.ok(scripts[0].includes(`var backgrounds = ${JSON.stringify(BACKGROUNDS).replaceAll('"', "'").replaceAll(',', ', ')};`));
});

test('no precarga el fondo: competía con el JS por la red en móvil (BLOG-146)', () => {
  assert.deepEqual(run({ stored: { 'admin-background': 'map' } }).preloads, []);
  assert.deepEqual(run({ path: '/login' }).preloads, []);
});

test('fuera del login no elige fondo', () => {
  assert.equal(run({ stored: { 'admin-background': 'map' } }).loginBackground, undefined);
});

test('en /login elige uno al azar y lo marca en <html>', () => {
  for (const [index, background] of BACKGROUNDS.entries()) {
    const random = (index + 0.5) / BACKGROUNDS.length;
    assert.equal(run({ path: '/login', random, stored: { 'admin-background': 'fold' } }).loginBackground, background);
  }
});
