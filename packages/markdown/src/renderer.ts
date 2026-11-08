import createDOMPurify, { type WindowLike } from 'dompurify';
import { Marked } from 'marked';

import { ALLOWED_ATTR, ALLOWED_TAGS, isExternalLink, isSafeUrl, type NewTabPolicy } from './policy';

/** Convierte Markdown en HTML sanitizado. */
export type MarkdownRenderer = (source: string) => string;

/**
 * Arma el render sobre un DOM concreto: el del navegador o el de jsdom. Las dos
 * variantes comparten todo lo demás, así que solo pueden diferir en el DOM.
 *
 * `baseUrl` se lee en cada llamada: en el navegador es la URL de la página en
 * ese momento. `newTab` decide qué links abren en otra pestaña.
 */
export function createRenderer(window: WindowLike, baseUrl: () => string, newTab: NewTabPolicy): MarkdownRenderer {
  const markdown = new Marked({ gfm: true, async: false });

  // Instancia propia: los hooks de DOMPurify son globales a cada instancia, y así
  // no afectan a nadie más que use la librería.
  const purify = createDOMPurify(window);
  // Sin un DOM utilizable, DOMPurify devuelve la entrada sin sanitizar.
  if (!purify.isSupported) {
    throw new Error('DOMPurify is not supported by this DOM');
  }

  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    if ((data.attrName === 'href' || data.attrName === 'src') && !isSafeUrl(data.attrValue, data.attrName, baseUrl())) {
      data.keepAttr = false;
    }
  });

  // target y rel no están en la allowlist: solo los pone este hook, y siempre
  // juntos, para que la página abierta no pueda usar window.opener.
  purify.addHook('afterSanitizeAttributes', (node) => {
    const href = node.tagName === 'A' ? node.getAttribute('href') : null;
    if (href !== null && (newTab === 'all' || isExternalLink(href, baseUrl()))) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return (source) => {
    const html = markdown.parse(source) as string;

    return purify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTR],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  };
}
