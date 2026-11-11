// @vitest-environment node
import { expect, it } from 'vitest';

import { codeBlocks } from './server.ts';

it('devuelve los bloques en orden de documento, con la primera palabra del info string', () => {
  const source = [
    '```ts title=a.ts',
    'const a = 1;',
    '```',
    '',
    '- item',
    '',
    '  ```sh',
    '  pnpm install',
    '  ```',
    '',
    '> ```',
    '> sin lenguaje',
    '> ```',
    '',
    '    indentado',
  ].join('\n');

  expect(codeBlocks(source)).toEqual([
    { lang: 'ts', text: 'const a = 1;' },
    { lang: 'sh', text: 'pnpm install' },
    { lang: '', text: 'sin lenguaje' },
    { lang: '', text: 'indentado' },
  ]);
});

it('ignora el código en línea y el HTML embebido', () => {
  expect(codeBlocks('`x` <pre><code>y</code></pre>\n\n<pre><code>z</code></pre>')).toEqual([]);
});

it('conserva el texto tal cual, sin escapar', () => {
  expect(codeBlocks('```html\n<img src=x onerror=alert(1)>\n```')).toEqual([
    { lang: 'html', text: '<img src=x onerror=alert(1)>' },
  ]);
});
