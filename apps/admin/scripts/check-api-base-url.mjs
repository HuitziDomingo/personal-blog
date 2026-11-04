// Verifica, antes del build de producción, que ADMIN_API_BASE_URL esté definido
// en la configuración production de angular.json y que sea un origen https.
// Solo usa módulos de Node: no agrega dependencias.
import { readFileSync } from 'node:fs';

const ANGULAR_JSON = new URL('../angular.json', import.meta.url);
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

console.log(`check-api-base-url: ${KEY} de production = ${value}`);
