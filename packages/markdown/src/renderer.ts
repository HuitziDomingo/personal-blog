import createDOMPurify, { type WindowLike } from 'dompurify';
import { Marked, type Tokens } from 'marked';

import { ALLOWED_ATTR, ALLOWED_TAGS, isExternalLink, isSafeUrl, type NewTabPolicy } from './policy.ts';

/** Convierte Markdown en HTML sanitizado. */
export type MarkdownRenderer = (source: string) => string;

/** El motor de Markdown, con la misma configuración en el render y en `codeBlocks`. */
function createMarked(): Marked {
  return new Marked({ gfm: true, async: false });
}

/** Un bloque de código del Markdown, tal como lo ve el motor del render. */
export interface CodeBlock {
  /** La primera palabra del info string (```ts title=x → `ts`); vacío si no hay. */
  lang: string;
  /** El texto del bloque, sin el salto de línea final. */
  text: string;
}

/**
 * Los bloques de código del Markdown, en orden de documento. La allowlist quita
 * `class`, así que el HTML sanitizado no conserva el lenguaje de cada bloque;
 * quien resalte código lo toma de aquí y lo empareja con el HTML ya
 * sanitizado. No devuelve HTML.
 */
export function codeBlocks(source: string): CodeBlock[] {
  const markdown = createMarked();
  const blocks: CodeBlock[] = [];
  // walkTokens devuelve las promesas de las extensiones async; aquí no hay.
  void markdown.walkTokens(markdown.lexer(source), (token) => {
    if (token.type === 'code') {
      const { lang, text } = token as Tokens.Code;
      blocks.push({ lang: /^\S*/.exec(lang ?? '')?.[0] ?? '', text: text.replace(/\n$/, '') });
    }
  });

  return blocks;
}

/**
 * Arma el render sobre un DOM concreto: el del navegador o el de jsdom. Las dos
 * variantes comparten todo lo demás, así que solo pueden diferir en el DOM.
 *
 * `baseUrl` se lee en cada llamada: en el navegador es la URL de la página en
 * ese momento. `newTab` decide qué links abren en otra pestaña.
 */
export function createRenderer(window: WindowLike, baseUrl: () => string, newTab: NewTabPolicy): MarkdownRenderer {
  const markdown = createMarked();

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
