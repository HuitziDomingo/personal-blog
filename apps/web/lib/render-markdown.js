// @ts-check
// Markdown → HTML seguro para las páginas de posts (ADR-010, punto 4).
//
// TODO(ADR de apps/web): la allowlist y el filtro de URLs están DUPLICADOS de
// apps/admin/src/app/core/markdown/render-markdown.ts. Si cambia uno, hay que
// cambiar el otro. La propuesta es moverlos a un paquete del workspace
// (packages/markdown) que usen los dos; ver la descripción del PR.
//
// Diferencias con el admin, solo por correr en el servidor:
// - DOMPurify usa la ventana de jsdom en vez de la del navegador.
// - Las URLs relativas se resuelven contra el origen del sitio (SITE_URL), no
//   contra window.location.
// - Los links no abren otra pestaña: en el blog no hay cambios sin guardar.
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Marked } from 'marked';

/** Etiquetas permitidas: las mismas que el admin. */
export const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/** Atributos permitidos: los mismos que el admin. */
export const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'start', 'align'];

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Origen del sitio público, para resolver URLs relativas. */
export function siteOrigin() {
  return new URL(process.env.SITE_URL ?? 'http://localhost:3000').origin;
}

/**
 * Decide si una URL se conserva, con las mismas reglas que el admin:
 * absolutas solo http(s), y mailto en links; relativas solo si resuelven al
 * origen del sitio; anclas solo en links.
 * @param {string} value
 * @param {'href' | 'src'} attribute
 * @param {string} [origin]
 */
export function isSafeUrl(value, attribute, origin = siteOrigin()) {
  const trimmed = value.trim();
  if (attribute === 'href' && trimmed.startsWith('#')) {
    return true;
  }

  /** @type {URL} */
  let url;
  try {
    url = new URL(trimmed, `${origin}/`);
  } catch {
    return false;
  }

  if (!ABSOLUTE.test(trimmed)) {
    return url.origin === origin;
  }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    return true;
  }
  return attribute === 'href' && url.protocol === 'mailto:';
}

const markdown = new Marked({ gfm: true, async: false });

// Una instancia propia sobre jsdom: los hooks no afectan a nadie más. El cast
// es necesario porque los tipos de jsdom y los del DOM no coinciden; la
// compatibilidad real se comprueba justo debajo.
const purify = createDOMPurify(/** @type {any} */ (new JSDOM('').window));

// Si la ventana no le sirve (por ejemplo, tras subir jsdom de major),
// DOMPurify devuelve el HTML sin sanitizar en vez de fallar. Aquí falla.
if (!purify.isSupported) {
  throw new Error('render-markdown: DOMPurify no es compatible con la ventana de jsdom');
}

/** Configuración que se pasa a sanitize: la misma que el admin. */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if ((data.attrName === 'href' || data.attrName === 'src') && !isSafeUrl(data.attrValue, data.attrName)) {
    data.keepAttr = false;
  }
});

purify.addHook('afterSanitizeAttributes', (node) => {
  // Los links externos no le pasan el contexto de esta página al destino.
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convierte Markdown en HTML sanitizado. Es lo único que se pasa a
 * dangerouslySetInnerHTML.
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  const html = /** @type {string} */ (markdown.parse(source));

  // rel no está permitido: lo pone el hook después del filtrado, como hace el
  // admin con rel y target.
  return purify.sanitize(html, SANITIZE_CONFIG);
}
