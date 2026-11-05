// Verifica, antes del build de producción, que ADMIN_API_BASE_URL esté definido
// en la configuración production de angular.json, que sea un origen https y que
// el connect-src de la CSP de vercel.json permita exactamente ese origen.
// Solo usa módulos de Node: no agrega dependencias.
import { readFileSync } from 'node:fs';

const ANGULAR_JSON = new URL('../angular.json', import.meta.url);
const VERCEL_JSON = new URL('../vercel.json', import.meta.url);
const KEY = 'ADMIN_API_BASE_URL';

function fail(message) {
  console.error(`check-api-base-url: ${message}`);
  process.exit(1);
}

const angularJson = JSON.parse(readFileSync(ANGULAR_JSON, 'utf8'));
const literal =
  angularJson.projects?.admin?.architect?.build?.configurations?.production?.define?.[KEY];

if (literal === undefined) {
  fail(`falta ${KEY} en projects.admin.architect.build.configurations.production.define`);
}

// define inserta el valor tal cual como código: tiene que ser un literal de
// string, entre comillas simples o dobles y sin comillas ni escapes dentro.
const match = /^'([^'"\\]*)'$|^"([^'"\\]*)"$/.exec(literal);
if (!match) {
  fail(`${KEY} debe ser un literal de string, por ejemplo "'https://api.example.com'"; vale ${literal}`);
}
const value = match[1] ?? match[2];

let url;
try {
  url = new URL(value);
} catch {
  fail(`${KEY} no es una URL válida: ${value}`);
}

if (url.protocol !== 'https:') {
  fail(`${KEY} debe usar https en producción: ${value}`);
}

// Solo el origen: sin path, query, fragmento, credenciales ni barra final. La
// CSP (connect-src) y credentials.interceptor comparan contra este origen.
if (url.origin !== value) {
  fail(`${KEY} debe ser un origen sin path ni barra final (${url.origin}): ${value}`);
}

// La CSP de la cabecera de Vercel (ADR-012, punto 7) limita connect-src al
// origen de la API. Si no coinciden, el admin no puede llamar a la API en
// producción y el build no lo detectaría.
let vercelJson;
try {
  vercelJson = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
} catch (error) {
  fail(`no se pudo leer vercel.json: ${error.message}`);
}

const policies = (vercelJson.headers ?? []).flatMap((rule) =>
  (rule.headers ?? [])
    .filter((header) => header.key?.toLowerCase() === 'content-security-policy')
    .map((header) => ({ source: rule.source, value: String(header.value ?? '') })),
);

if (policies.length === 0) {
  fail('vercel.json no define la cabecera Content-Security-Policy');
}

for (const { source, value: policy } of policies) {
  const directives = new Map(
    policy
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );

  // Con default-src o script-src en la cabecera, el navegador bloquearía el
  // script inline que inyecta autoCsp.
  for (const forbidden of ['default-src', 'script-src']) {
    if (directives.has(forbidden)) {
      fail(`la CSP de vercel.json (${source}) no debe incluir ${forbidden}: la de scripts la genera autoCsp`);
    }
  }

  const connectSrc = directives.get('connect-src');
  if (!connectSrc) {
    fail(`la CSP de vercel.json (${source}) no tiene connect-src`);
  }

  if (connectSrc.length !== 1 || connectSrc[0] !== value) {
    fail(`connect-src de vercel.json (${source}) es "${connectSrc.join(' ')}"; debe ser exactamente ${value}`);
  }
}

console.log(`check-api-base-url: ${KEY} de production = ${value}`);
console.log(`check-api-base-url: connect-src de vercel.json = ${value}`);
