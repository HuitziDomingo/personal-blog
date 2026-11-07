// Prueba el script inline de src/index.html que aplica el tema antes de que
// arranque Angular. Lo ejecuta con fakes de document, localStorage y
// matchMedia, y lo compara con las listas de theme.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ACCENTS, THEME_STORAGE_KEYS } from '../src/app/core/theme/theme.ts';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map(([, body]) => body);

function run({ stored = {}, systemDark = false, storageThrows = false } = {}) {
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

  new Function('document', 'window', 'localStorage', 'matchMedia', scripts[0])(
    { documentElement: root },
    window,
    localStorage,
    matchMedia,
  );

  return { dark: classes.has('dark'), accent: attributes['data-accent'] };
}

test('index.html tiene un solo script inline, el del tema', () => {
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
  assert.deepEqual(run({ storageThrows: true, systemDark: true }), { dark: true, accent: 'neutral' });
});
