// Casos de check-csp-meta.mjs con el runner de Node (node --test): sin
// dependencias.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-csp-meta.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'check-csp-meta-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const LOADER = "(() => { const s = document.createElement('script'); s.src = 'main.js'; document.body.appendChild(s); })();";
const sha = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
const meta = (policy) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
const VALID_POLICY = `script-src 'strict-dynamic' ${sha(LOADER)} https: 'unsafe-inline';object-src 'none';base-uri 'self';`;

function page({ head = meta(VALID_POLICY), body = `<script>${LOADER}</script>` } = {}) {
  return `<!doctype html><html><head>${head}<meta charset="utf-8"></head><body>${body}</body></html>`;
}

let count = 0;
function check(html) {
  const file = join(dir, `index-${count++}.html`);
  writeFileSync(file, html);
  return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
}

test('acepta el index.html que genera autoCsp', () => {
  const result = check(page());
  assert.equal(result.status, 0, result.stderr);
});

const failures = [
  ['falta el index.html', null, /no se pudo leer/],
  ['sin <meta> de CSP (build sin autoCsp)', page({ head: '' }), /no tiene <meta/],
  ['dos <meta> de CSP', page({ head: meta(VALID_POLICY) + meta(VALID_POLICY) }), /2 <meta>/],
  ['meta después de un script', page({ head: `<script>${LOADER}</script>${meta(VALID_POLICY)}`, body: '' }), /después de un <script>/],
  ['meta sin script-src', page({ head: meta("object-src 'none'") }), /no tiene script-src/],
  ["sin 'strict-dynamic'", page({ head: meta(`script-src ${sha(LOADER)}`) }), /'strict-dynamic'/],
  ["'unsafe-inline' sin hash", page({ head: meta("script-src 'strict-dynamic' 'unsafe-inline'"), body: '' }), /permitiría cualquier script inline/],
  ['sin hashes ni unsafe-inline', page({ head: meta("script-src 'strict-dynamic'"), body: '' }), /no tiene hashes/],
  ["'unsafe-eval'", page({ head: meta(`script-src 'strict-dynamic' ${sha(LOADER)} 'unsafe-eval'`) }), /'unsafe-eval'/],
  ['script inline sin su hash', page({ body: `<script>${LOADER}</script><script>alert(1)</script>` }), /no tiene su hash/],
];

for (const [name, html, message] of failures) {
  test(`falla: ${name}`, () => {
    const result =
      html === null
        ? spawnSync(process.execPath, [SCRIPT, join(dir, 'no-existe.html')], { encoding: 'utf8' })
        : check(html);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  });
}
