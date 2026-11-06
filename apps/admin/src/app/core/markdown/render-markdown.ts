import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * Etiquetas y atributos que puede producir la vista previa (ADR-010, punto 4,
 * y ADR-012, punto 6). Es una allowlist: lo que no está aquí se elimina, aunque
 * DOMPurify lo permita por defecto.
 */
export const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
] as const;

export const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'start', 'align'] as const;

// URLs permitidas. DOMPurify deja pasar `data:` en <img> aunque su expresión de
// URIs no lo acepte, así que las URLs se filtran también en un hook.
const SAFE_HREF = /^(?:https?:|mailto:|#|\/(?!\/))/i;
const SAFE_SRC = /^(?:https?:|\/(?!\/))/i;

const markdown = new Marked({ gfm: true, async: false });

// Instancia propia: los hooks de DOMPurify son globales a cada instancia, y así
// no afectan a nadie más que use la librería.
const purify = DOMPurify(window);

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  const value = data.attrValue.trim();
  if (data.attrName === 'href' && !SAFE_HREF.test(value)) {
    data.keepAttr = false;
  }
  if (data.attrName === 'src' && !SAFE_SRC.test(value)) {
    data.keepAttr = false;
  }
});

// Los links de la vista previa abren otra pestaña: un clic no debe sacar al
// autor del editor con cambios sin guardar.
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convierte Markdown en HTML seguro para la vista previa. El resultado se
 * enlaza con `[innerHTML]`, que vuelve a pasar por el sanitizador de Angular.
 * Nunca se usa `bypassSecurityTrust*` sobre contenido del usuario (ADR-012).
 */
export function renderMarkdown(source: string): string {
  const html = markdown.parse(source) as string;

  return purify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
