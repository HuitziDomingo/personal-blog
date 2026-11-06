// Sirve el build de producción (dist/admin/browser) en 127.0.0.1 con las
// mismas cabeceras y rewrites que declara vercel.json, para comprobar la CSP
// en local antes de un preview de Vercel (ADR-012, punto 7).
// Solo usa módulos de Node: no agrega dependencias.
//
// Uso: node scripts/serve-dist.mjs [puerto] [directorio]
// Por defecto, puerto 4300 y directorio dist/admin/browser.
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[3]
  ? resolvePath(process.argv[3]) + sep
  : fileURLToPath(new URL('../dist/admin/browser/', import.meta.url));
const VERCEL_JSON = new URL('../vercel.json', import.meta.url);
const HOST = '127.0.0.1';
const PORT = Number(process.argv[2] ?? 4300);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const vercel = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));

// Vercel usa la sintaxis de path-to-regexp. Aquí solo hace falta la forma
// "/(.*)", que se traduce a una expresión regular anclada.
function matches(source, path) {
  return new RegExp(`^${source}$`).test(path);
}

function headersFor(path) {
  return (vercel.headers ?? [])
    .filter((rule) => matches(rule.source, path))
    .flatMap((rule) => rule.headers);
}

// Devuelve la ruta del archivo dentro de ROOT, o null si no existe o si la
// petición intenta salir de ROOT.
function fileFor(path) {
  const file = normalize(join(ROOT, decodeURIComponent(path)));
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return null;
  }

  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

// Como Vercel: primero el sistema de archivos y después los rewrites.
function resolve(path) {
  const file = fileFor(path === '/' ? '/index.html' : path);
  if (file) {
    return file;
  }

  const rewrite = (vercel.rewrites ?? []).find((rule) => matches(rule.source, path));
  return rewrite ? fileFor(rewrite.destination) : null;
}

const server = createServer((request, response) => {
  const path = new URL(request.url, `http://${HOST}`).pathname;

  for (const { key, value } of headersFor(path)) {
    response.setHeader(key, value);
  }

  let file;
  try {
    file = resolve(path);
  } catch {
    file = null;
  }

  if (!file || (request.method !== 'GET' && request.method !== 'HEAD')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  response.end(request.method === 'HEAD' ? undefined : readFileSync(file));
});

server.listen(PORT, HOST, () => {
  console.log(`serve-dist: http://${HOST}:${PORT} (cabeceras de vercel.json)`);
});
