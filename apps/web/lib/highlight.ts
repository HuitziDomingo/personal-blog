import type { CodeBlock } from '@personal-blog/markdown/server';
import { createHighlighterCoreSync, type HighlighterCore, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import css from 'shiki/langs/css.mjs';
import diff from 'shiki/langs/diff.mjs';
import docker from 'shiki/langs/docker.mjs';
import go from 'shiki/langs/go.mjs';
import html from 'shiki/langs/html.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import json from 'shiki/langs/json.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import shellscript from 'shiki/langs/shellscript.mjs';
import sql from 'shiki/langs/sql.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import githubLight from 'shiki/themes/github-light-default.mjs';

export const LIGHT_THEME = 'github-light-default';
export const DARK_THEME = 'github-dark-default';

/**
 * Colores de github-light-default que no llegan a AA (4.5:1) sobre el fondo
 * de código claro (`palette.light.code`), cambiados por tonos más oscuros de la
 * misma paleta de GitHub (Primer). github-dark-default ya cumple sobre el fondo
 * oscuro. lib/highlight.test.ts lo verifica.
 */
const LIGHT_REPLACEMENTS: Record<string, string> = {
  '#6e7781': '#57606a', // comentarios
  '#cf222e': '#b31d28', // palabras clave
  '#8250df': '#6639ba', // funciones
};

let highlighter: HighlighterCore | undefined;

/**
 * Shiki con un conjunto cerrado de lenguajes y el motor de regex de JavaScript,
 * sin WebAssembly. Corre solo en el servidor: este módulo lo importa
 * lib/markdown, que solo usan las páginas del servidor.
 */
function getHighlighter(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: [css, diff, docker, go, html, javascript, json, jsx, shellscript, sql, tsx, typescript, yaml],
    engine: createJavaScriptRegexEngine(),
  });

  return highlighter;
}

/** Los lenguajes que se resaltan, con sus alias (`ts`, `sh`, `yml`…). */
export function supportedLanguages(): string[] {
  return getHighlighter().getLoadedLanguages();
}

/** Los tokens de un fragmento, con sus colores claro y oscuro como variables CSS. */
export function tokenize(code: string, lang: string): ThemedToken[][] {
  return getHighlighter().codeToTokens(code, {
    lang,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    defaultColor: false,
    colorReplacements: { [LIGHT_THEME]: LIGHT_REPLACEMENTS },
  }).tokens;
}

const STYLE_PROPERTY = /^--shiki-(light|dark)(-font-style|-font-weight|-text-decoration)?$/;
const STYLE_VALUE = /^(#[0-9a-f]{3,8}|[a-z -]+)$/i;

/**
 * El `style` de un token. Los valores vienen de los temas empaquetados, no
 * del post; aun así solo pasan variables `--shiki-*` con un color o una
 * palabra clave.
 */
function tokenStyle(token: ThemedToken): string {
  return Object.entries(token.htmlStyle ?? {})
    .filter(([property, value]) => STYLE_PROPERTY.test(property) && STYLE_VALUE.test(value))
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
}

/**
 * Resalta los bloques de código de un HTML **ya sanitizado** (ADR-017,
 * punto 5). Lee el texto de cada `<pre><code>` del DOM, nunca del Markdown, y
 * construye los `<span>` con `textContent` y `setAttribute`: el texto del post
 * no se interpreta como HTML. El lenguaje sale de `blocks` (ver `codeBlocks`
 * en packages/markdown); un bloque se resalta solo si su texto coincide con el
 * del siguiente bloque pendiente. Un `<pre>` escrito como HTML en el post, un
 * bloque sin lenguaje o con uno no soportado quedan como texto plano.
 */
export function highlightCodeBlocks(root: DocumentFragment, blocks: readonly CodeBlock[]): void {
  const document = root.ownerDocument;
  const languages = new Set(supportedLanguages());
  let next = 0;

  for (const code of root.querySelectorAll('pre > code')) {
    const text = code.textContent.replace(/\n$/, '');
    const block = blocks[next];
    if (!block || block.text !== text) {
      continue;
    }
    next += 1;

    const lang = block.lang.toLowerCase();
    if (!languages.has(lang)) {
      continue;
    }

    const nodes: Node[] = [];
    tokenize(text, lang).forEach((line, index) => {
      if (index > 0) {
        nodes.push(document.createTextNode('\n'));
      }
      for (const token of line) {
        const style = tokenStyle(token);
        if (!style || !token.content.trim()) {
          nodes.push(document.createTextNode(token.content));
          continue;
        }
        const span = document.createElement('span');
        span.setAttribute('style', style);
        span.textContent = token.content;
        nodes.push(span);
      }
    });
    nodes.push(document.createTextNode('\n'));
    code.replaceChildren(...nodes);
  }
}
