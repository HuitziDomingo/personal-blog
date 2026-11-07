import { describe, expect, it } from 'vitest';

import { ALLOWED_ATTR, ALLOWED_TAGS } from '../policy';
import type { MarkdownRenderer } from '../renderer';

/** Parsea HTML en un contenedor del DOM que tenga cada entorno. */
export type HtmlParser = (html: string) => Element;

/**
 * Casos de la suite. Viven en datos, no solo en `it`, para que
 * equivalence.spec.ts compare las dos variantes con exactamente los mismos.
 */
export const CASES = {
  common:
    '# Título\n\nTexto con **negrita**, *énfasis* y `código`.\n\n- uno\n- dos\n\n```js\nconst a = 1 < 2;\n```\n\n| a | b |\n|:--|--:|\n| 1 | 2 |',
  links: '[a](https://huitzi.xyz) [b](mailto:hola@huitzi.xyz) [c](#seccion) [d](/posts/x)',
  image: '![gato](https://huitzi.xyz/gato.png "Un gato")',
  scripts: [
    ['<script>', 'Hola <script>alert(1)</script> mundo'],
    ['<script> en bloque', '<script>\nalert(1)\n</script>'],
    ['<script> con src', '<script src="https://evil.test/x.js"></script>'],
  ],
  eventAttributes: [
    ['onerror en <img>', '<img src="x" onerror="alert(1)">'],
    ['onload en <svg>', '<svg onload="alert(1)"></svg>'],
    ['onclick en un link HTML', '<a href="https://huitzi.xyz" onclick="alert(1)">x</a>'],
    ['onmouseover en <p>', '<p onmouseover="alert(1)">x</p>'],
    ['style', '<p style="background:url(https://evil.test)">x</p>'],
  ],
  javascriptUrls: [
    ['link Markdown', '[x](javascript:alert(1))'],
    ['link HTML', '<a href="javascript:alert(1)">x</a>'],
    ['mayúsculas y espacios', '<a href=" JaVaScRiPt:alert(1)">x</a>'],
    ['entidades', '<a href="javascript&#58;alert(1)">x</a>'],
    ['tabulador dentro del esquema', '<a href="java\tscript:alert(1)">x</a>'],
    ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
  ],
  dataUrls: [
    ['imagen Markdown', '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)'],
    ['imagen HTML', '<img src="data:image/png;base64,iVBORw0KGgo=">'],
    ['link Markdown', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['link HTML', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ],
  embedded: [
    ['<iframe>', '<iframe src="https://evil.test"></iframe>'],
    ['<iframe srcdoc>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['<object>', '<object data="https://evil.test/x.swf"></object>'],
    ['<embed>', '<embed src="https://evil.test/x.swf">'],
    ['<form>', '<form action="https://evil.test"><input name="x"><button>Enviar</button></form>'],
    ['<style>', '<style>body{display:none}</style>'],
    ['<base>', '<base href="https://evil.test/">'],
    ['<meta>', '<meta http-equiv="refresh" content="0;url=https://evil.test">'],
  ],
  offOrigin: [
    ['Markdown //', '[x](//evil.test) ![y](//evil.test/y.png)'],
    ['HTML //', '<a href="//evil.test">x</a><img src="//evil.test/y.png">'],
    ['HTML /\\', '<a href="/\\evil.test">x</a><img src="/\\evil.test/y.png">'],
    ['HTML \\\\', '<a href="\\\\evil.test">x</a><img src="\\\\evil.test/y.png">'],
    ['HTML con tab entre las barras', '<a href="/\t/evil.test">x</a><img src="/\t/evil.test/y.png">'],
    ['HTML con salto de línea', '<a href="/\n/evil.test">x</a>'],
  ],
  // Entradas con las que se comprobó que el paquete da el mismo HTML que el
  // render original del admin (BLOG-065).
  regressions: [
    ['URLs relativas y de otro puerto', '<a href="/relativo">r</a> <a href="https://huitzi.xyz:8443/x">p</a> <img src="/a.png"> <img src="http://x.test/a.png">'],
    ['esquemas no permitidos', '<a href="mailto:x@y.z">m</a><img src="mailto:x@y.z"><a href="tel:123">t</a><a href="ftp://x">f</a>'],
    ['anclas y vacíos', '<a href="#a">a</a><img src="#a"><a href="?q=1">q</a><a href="">e</a><a href=" ">s</a>'],
    ['listas, citas y tachado', '1. uno\n2. dos\n\n3. tres\n\n> cita\n\n---\n\n~~tachado~~'],
    ['<details>', '<details><summary>x</summary>y</details>'],
    ['<math> con xlink', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
    ['<svg> con xlink', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['mXSS con <noscript>', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
    ['atributos fuera de la allowlist', '<table><tr><td align="center" style="x">c</td></tr></table><img src="https://huitzi.xyz/a.png" width="1" loading="lazy">'],
    ['link con < >', '[x](<javascript:alert(1)>)'],
    ['target y rel propios', '<a href="https://huitzi.xyz" target="_self" rel="opener">x</a>'],
  ],
} as const satisfies Record<string, string | readonly (readonly [string, string])[]>;

/** Todos los Markdown de la suite, con su nombre. */
export function allCases(): [string, string][] {
  return Object.entries(CASES).flatMap(([group, value]): [string, string][] =>
    typeof value === 'string' ? [[group, value]] : value.map(([name, source]): [string, string] => [`${group}: ${name}`, source]),
  );
}

/**
 * Los tests de sanitización que tenía apps/admin, sin cambios de criterio. Cada
 * variante (navegador y servidor) los corre con su render y su parser.
 */
export function describeSanitization(variant: string, renderMarkdown: MarkdownRenderer, parse: HtmlParser): void {
  /** Toda etiqueta y atributo del resultado debe estar en la allowlist. */
  function expectOnlyAllowlisted(html: string): void {
    const extraAttributes = new Set(['target', 'rel']);
    for (const element of parse(html).querySelectorAll('*')) {
      expect(ALLOWED_TAGS).toContain(element.tagName.toLowerCase());
      for (const attribute of element.getAttributeNames()) {
        if (!extraAttributes.has(attribute)) {
          expect(ALLOWED_ATTR).toContain(attribute);
        }
      }
    }
  }

  describe(`renderMarkdown (${variant})`, () => {
    it('convierte el Markdown habitual', () => {
      const html = renderMarkdown(CASES.common);
      const dom = parse(html);

      expect(dom.querySelector('h1')?.textContent).toBe('Título');
      expect(dom.querySelector('strong')?.textContent).toBe('negrita');
      expect(dom.querySelector('em')?.textContent).toBe('énfasis');
      expect(dom.querySelectorAll('li')).toHaveLength(2);
      expect(dom.querySelector('pre code')?.textContent).toBe('const a = 1 < 2;\n');
      expect(dom.querySelector('th')?.getAttribute('align')).toBe('left');
      expectOnlyAllowlisted(html);
    });

    it('conserva links https, mailto, anclas y rutas, y los abre en otra pestaña', () => {
      const links = [...parse(renderMarkdown(CASES.links)).querySelectorAll('a')];

      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'https://huitzi.xyz',
        'mailto:hola@huitzi.xyz',
        '#seccion',
        '/posts/x',
      ]);
      for (const link of links) {
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      }
    });

    it('conserva imágenes https', () => {
      const img = parse(renderMarkdown(CASES.image)).querySelector('img');

      expect(img?.getAttribute('src')).toBe('https://huitzi.xyz/gato.png');
      expect(img?.getAttribute('alt')).toBe('gato');
      expect(img?.getAttribute('title')).toBe('Un gato');
    });

    describe('elimina lo peligroso', () => {
      it.each(CASES.scripts)('%s', (_name, source) => {
        const html = renderMarkdown(source);

        expect(parse(html).querySelector('script')).toBeNull();
        expect(html).not.toContain('alert(1)');
        expect(html).not.toContain('evil.test');
      });

      it.each(CASES.eventAttributes)('atributos de evento y estilo: %s', (_name, source) => {
        const html = renderMarkdown(source);

        expect(html).not.toMatch(/\son\w+=/i);
        expect(html).not.toContain('alert(1)');
        expect(html).not.toContain('style=');
        expect(parse(html).querySelector('svg')).toBeNull();
        expectOnlyAllowlisted(html);
      });

      it.each(CASES.javascriptUrls)('URLs javascript: — %s', (_name, source) => {
        const html = renderMarkdown(source);

        for (const link of parse(html).querySelectorAll('a')) {
          expect(link.hasAttribute('href')).toBe(false);
        }
        expect(html.toLowerCase()).not.toContain('script:');
      });

      it.each(CASES.dataUrls)('URLs data: — %s', (_name, source) => {
        const html = renderMarkdown(source);

        for (const element of parse(html).querySelectorAll('[src], [href]')) {
          expect(element.getAttribute('src') ?? element.getAttribute('href')).not.toMatch(/^\s*data:/i);
        }
        expect(html).not.toContain('data:');
      });

      it.each(CASES.embedded)('elementos embebidos y de documento: %s', (_name, source) => {
        const html = renderMarkdown(source);

        expect(parse(html).querySelector('iframe, object, embed, form, input, button, style, base, meta')).toBeNull();
        expect(html).not.toContain('evil.test');
        expectOnlyAllowlisted(html);
      });

      it.each(CASES.regressions)('regresión: %s', (_name, source) => {
        const html = renderMarkdown(source);

        expect(html).not.toMatch(/\son\w+=|javascript:|style=/i);
        expectOnlyAllowlisted(html);
      });

      it.each(CASES.offOrigin)('URLs que salen del origen sin esquema: %s', (_name, source) => {
        const html = renderMarkdown(source);

        for (const element of parse(html).querySelectorAll('a, img')) {
          expect(element.hasAttribute('href') || element.hasAttribute('src')).toBe(false);
        }
        expect(html).not.toContain('evil.test');
      });
    });
  });
}
