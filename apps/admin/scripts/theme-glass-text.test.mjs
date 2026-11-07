// El glass de la barra superior y del offcanvas (bg-background/80) no da
// contraste AA a muted-foreground en el peor caso (check-theme-contrast.mjs),
// así que el shell y el menú no lo usan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const GLASS_FILES = ['../src/app/core/layout/admin-shell.ts', '../src/app/core/layout/admin-nav.ts'];

test('el shell y el menú no usan texto secundario sobre el glass', () => {
  for (const file of GLASS_FILES) {
    // Busca la clase en atributos class="…", no en comentarios que la mencionen.
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bclass="[^"]*\btext-muted-foreground\b/, file);
  }
});
