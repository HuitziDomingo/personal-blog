// Casos de XSS del admin (render-markdown.spec.ts), sobre la copia del
// servidor. Corre con node --test, sin Next.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSafeUrl, renderMarkdown, SANITIZE_CONFIG } from './render-markdown.js';

test('usa la misma allowlist que el admin', async () => {
  const { readFileSync } = await import('node:fs');
  const admin = readFileSync(new URL('../../admin/src/app/core/markdown/render-markdown.ts', import.meta.url), 'utf8');
  /** @param {string} name */
  const list = (name) =>
    [...(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`).exec(admin)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(([, v]) => v);
  // Se compara la configuración que de verdad se pasa a sanitize.
  assert.deepEqual(SANITIZE_CONFIG.ALLOWED_TAGS, list('ALLOWED_TAGS'));
  assert.deepEqual(SANITIZE_CONFIG.ALLOWED_ATTR, list('ALLOWED_ATTR'));
  assert.equal(SANITIZE_CONFIG.ALLOW_DATA_ATTR, false);
  assert.equal(SANITIZE_CONFIG.ALLOW_ARIA_ATTR, false);
  assert.match(admin, /ALLOW_DATA_ATTR: false,\s*ALLOW_ARIA_ATTR: false/);
});

test('no deja pasar el rel que escribe el autor', () => {
  assert.equal(renderMarkdown('<a rel="opener">x</a>'), '<p><a>x</a></p>\n');
  assert.match(renderMarkdown('<a href="https://x.test" rel="opener">x</a>'), /rel="noopener noreferrer"/);
});

test('renderiza Markdown con GFM', () => {
  const html = renderMarkdown('# Título\n\n**negrita** y `code`\n\n| a |\n| - |\n| 1 |');
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<strong>negrita<\/strong>/);
  assert.match(html, /<table>/);
});

test('quita scripts, handlers y etiquetas fuera de la allowlist', () => {
  const html = renderMarkdown('<script>alert(1)</script><img src="https://x.test/a.png" onerror="alert(1)"><iframe src="https://x.test"></iframe><div style="x">t</div>');
  assert.doesNotMatch(html, /script|onerror|iframe|style|<div/);
  assert.match(html, /<img src="https:\/\/x.test\/a.png">/);
});

test('filtra URLs peligrosas en links e imágenes', () => {
  // El backslash va en HTML crudo: dentro de Markdown, marked lo codifica como
  // %5C y queda una ruta del mismo origen.
  const html = renderMarkdown('[a](javascript:alert(1)) <a href="/\\evil.test">b</a> ![c](data:image/png;base64,AAAA) [d](mailto:a@b.c) [e](#nota)');
  assert.doesNotMatch(html, /javascript:|evil\.test|data:/);
  assert.match(html, /href="mailto:a@b.c"/);
  assert.match(html, /href="#nota"/);
});

test('isSafeUrl resuelve como el navegador', () => {
  const origin = 'http://localhost:3000';
  assert.equal(isSafeUrl('/posts/a', 'href', origin), true);
  assert.equal(isSafeUrl('//evil.test/x', 'href', origin), false);
  assert.equal(isSafeUrl('/\\evil.test', 'href', origin), false);
  assert.equal(isSafeUrl('mailto:a@b.c', 'src', origin), false);
});

test('los links llevan rel="noopener noreferrer"', () => {
  assert.match(renderMarkdown('[a](https://x.test)'), /rel="noopener noreferrer"/);
});
