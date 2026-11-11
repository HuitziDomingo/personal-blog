import { readFileSync } from 'node:fs';

import { codeBlocks } from '@personal-blog/markdown/server';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { contrastRatio, palette } from './brand';
import { highlightCodeBlocks, supportedLanguages, tokenize } from './highlight';
import { renderPost } from './markdown';

const AA = 4.5;

function dom(html: string): Document {
  return new JSDOM(html).window.document;
}

function spans(html: string): HTMLSpanElement[] {
  return [...dom(html).querySelectorAll<HTMLSpanElement>('pre > code span')];
}

describe('renderPost', () => {
  it('resalta un bloque con lenguaje: spans con los colores claro y oscuro como variables', () => {
    const { html } = renderPost('```ts\nconst a = 1;\n```');
    const tokens = spans(html);

    expect(tokens.length).toBeGreaterThan(0);
    for (const span of tokens) {
      expect(span.getAttribute('style')).toMatch(/^--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}/i);
      expect(span.getAttributeNames()).toEqual(['style']);
    }
    expect(dom(html).querySelector('pre > code')?.textContent).toBe('const a = 1;\n');
  });

  it('acepta alias y mayúsculas en el lenguaje', () => {
    for (const lang of ['sh', 'bash', 'yml', 'TS', 'js', 'golang', 'dockerfile']) {
      const { html } = renderPost(`\`\`\`${lang}\nx\n\`\`\``);
      const known = supportedLanguages().includes(lang.toLowerCase());

      expect(spans(html).length > 0, lang).toBe(known);
    }
  });

  it('deja como texto plano los bloques sin lenguaje o con uno no soportado', () => {
    for (const source of ['```\nconst a = 1;\n```', '```cobol\nDISPLAY "x".\n```', '    const a = 1;']) {
      expect(renderPost(source).html).toMatch(/<pre><code>[^<]*<\/code><\/pre>/);
    }
  });

  it('el código del post sigue siendo texto: no crea elementos ni atributos', () => {
    const source = '```html\n<img src=x onerror=alert(1)><script>alert(1)</script>\n```';
    const { html } = renderPost(source);
    const doc = dom(html);

    expect(doc.querySelector('img, script')).toBeNull();
    expect(doc.querySelector('pre > code')?.textContent).toBe('<img src=x onerror=alert(1)><script>alert(1)</script>\n');
    const attributes = [...doc.querySelectorAll('*')].flatMap((el) => el.getAttributeNames());
    expect(new Set(attributes)).toEqual(new Set(['style']));
  });

  it('resalta después de sanitizar: un <pre> escrito como HTML no se resalta ni desplaza a los demás', () => {
    const source = '<pre><code>const raw = 1;</code></pre>\n\n```ts\nconst fenced = 2;\n```';
    const codes = [...dom(renderPost(source).html).querySelectorAll('pre > code')];

    expect(codes).toHaveLength(2);
    expect(codes[0]?.querySelector('span')).toBeNull();
    expect(codes[1]?.querySelector('span')).not.toBeNull();
  });

  it('los atributos que la allowlist quita no vuelven: el HTML no lleva class', () => {
    expect(renderPost('```ts\nconst a = 1;\n```').html).not.toContain('class=');
  });
});

describe('highlightCodeBlocks', () => {
  it('solo resalta un bloque cuyo texto coincide con el del Markdown', () => {
    const template = dom('').createElement('template');
    template.innerHTML = '<pre><code>otro texto\n</code></pre>';
    highlightCodeBlocks(template.content, codeBlocks('```ts\nconst a = 1;\n```'));

    expect(template.innerHTML).toBe('<pre><code>otro texto\n</code></pre>');
  });
});

describe('contraste AA', () => {
  const samples: [string, string][] = [
    ['ts', 'import { a } from "b";\n// comentario\nexport async function f<T>(x: T): Promise<T> { return x ?? null; }\nclass A extends B { #p = 1; }'],
    ['tsx', 'export const C = () => <div className="a">{x}</div>;'],
    ['js', 'const re = /a+b/g; `t ${x}`; console.log(true, 1.5);'],
    ['jsx', '<Button onClick={() => go()}>Hola</Button>'],
    ['json', '{ "a": 1, "b": [true, null, "x"] }'],
    ['sh', '#!/bin/sh\n# comentario\nexport A="x" && pnpm --filter web build | tee log.txt'],
    ['yaml', '# comentario\nservices:\n  db:\n    image: "mongo:8"\n    ports: [27017]\n    on: true'],
    ['go', 'package main\n\n// Doc\nfunc (s *S) Get(ctx context.Context) (int, error) { return 0, fmt.Errorf("x: %w", err) }'],
    ['html', '<!doctype html><a href="/x" class="y">t</a><style>a{color:red}</style><script>let a = 1</script>'],
    ['css', '@media (min-width: 1px) { .a > b:hover { color: #fff !important; } }'],
    ['sql', "SELECT a, COUNT(*) FROM t WHERE b = 'x' -- comentario\nGROUP BY a;"],
    ['diff', '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new'],
    ['dockerfile', 'FROM node:24 AS build\n# comentario\nRUN pnpm install\nCOPY . .'],
  ];
  for (const post of ['arreglos', 'backend-api']) {
    const source = readFileSync(new URL(`../../../docs/web/posts-migrados/${post}.md`, import.meta.url), 'utf8');
    for (const { lang, text } of codeBlocks(source)) {
      if (lang) {
        samples.push([lang, text]);
      }
    }
  }

  it.each([
    ['light', '--shiki-light', palette.light.code],
    ['dark', '--shiki-dark', palette.dark.code],
  ] as const)('cada token del modo %s cumple 4.5:1 sobre el fondo de código', (_mode, variable, background) => {
    const failures = new Set<string>();
    for (const [lang, code] of samples) {
      for (const token of tokenize(code, lang).flat()) {
        const color = token.htmlStyle?.[variable];
        if (color && token.content.trim() && contrastRatio(color.slice(0, 7).toLowerCase(), background) < AA) {
          failures.add(`${lang}: ${color} ${JSON.stringify(token.content)}`);
        }
      }
    }

    expect([...failures]).toEqual([]);
  });
});
