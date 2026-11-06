// Verifica, después del build de producción, que index.html traiga el <meta> de
// CSP que genera autoCsp. La cabecera de vercel.json no tiene script-src (ADR-012,
// punto 7): si falta el meta, el admin queda sin protección de scripts y nada
// más lo detecta.
// Solo usa módulos de Node: no agrega dependencias.
//
// Uso: node scripts/check-csp-meta.mjs [ruta de index.html]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_INDEX = fileURLToPath(new URL('../dist/admin/browser/index.html', import.meta.url));
const indexPath = process.argv[2] ?? DEFAULT_INDEX;

function fail(message) {
  console.error(`check-csp-meta: ${message}`);
  process.exit(1);
}

let html;
try {
  html = readFileSync(indexPath, 'utf8');
} catch (error) {
  fail(`no se pudo leer ${indexPath}: ${error.message}`);
}

// Atributos de una etiqueta, con comillas dobles, simples o sin comillas.
function attributes(tag) {
  const attrs = new Map();
  for (const [, name, double, single, bare] of tag.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    attrs.set(name.toLowerCase(), double ?? single ?? bare ?? '');
  }
  return attrs;
}

const metas = [...html.matchAll(/<meta\b[^>]*>/gi)]
  .map((match) => ({ index: match.index, attrs: attributes(match[0].slice(5, -1)) }))
  .filter(({ attrs }) => attrs.get('http-equiv')?.toLowerCase() === 'content-security-policy');

if (metas.length === 0) {
  fail(`${indexPath} no tiene <meta http-equiv="Content-Security-Policy">: ¿falta security.autoCsp en production?`);
}
if (metas.length > 1) {
  fail(`${indexPath} tiene ${metas.length} <meta> de CSP; se espera uno`);
}
const [meta] = metas;

// Un <meta> de CSP solo protege lo que viene después de él en el documento.
const firstScript = html.search(/<script\b/i);
if (firstScript !== -1 && firstScript < meta.index) {
  fail('el <meta> de CSP aparece después de un <script>: ese script quedaría fuera de la política');
}

const directives = new Map(
  (meta.attrs.get('content') ?? '')
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...sources]) => [name.toLowerCase(), sources]),
);

const scriptSrc = directives.get('script-src');
if (!scriptSrc) {
  fail('el <meta> de CSP no tiene script-src');
}

const lower = scriptSrc.map((source) => source.toLowerCase());
if (!lower.includes("'strict-dynamic'")) {
  fail(`script-src no incluye 'strict-dynamic': ${scriptSrc.join(' ')}`);
}

// Con un hash o un nonce, el navegador ignora 'unsafe-inline' (CSP nivel 2+);
// sin ellos, 'unsafe-inline' permite cualquier script inline.
const hashes = scriptSrc.filter((source) => /^'sha(256|384|512)-[A-Za-z0-9+/]+=*'$/.test(source));
const nonces = lower.filter((source) => source.startsWith("'nonce-"));
if (hashes.length === 0 && nonces.length === 0) {
  fail(`script-src no tiene hashes: ${lower.includes("'unsafe-inline'") ? "'unsafe-inline' permitiría cualquier script inline" : 'el loader inline de autoCsp no podría correr'}`);
}

if (lower.includes("'unsafe-eval'")) {
  fail("script-src no debe incluir 'unsafe-eval'");
}

// Cada script inline del documento debe tener su hash en script-src. Si no, el
// meta es de otro build o el script no corre en producción.
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
  ([, attrs]) => !attributes(attrs).has('src'),
);
for (const [, , body] of inlineScripts) {
  const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  if (!hashes.includes(hash)) {
    fail(`un script inline no tiene su hash ${hash} en script-src: ${body.trim().slice(0, 60)}`);
  }
}

console.log(`check-csp-meta: script-src con 'strict-dynamic' y ${hashes.length} hashes; ${inlineScripts.length} scripts inline cubiertos`);
