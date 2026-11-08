import { expect, it } from 'vitest';

import { renderPostMarkdown } from './markdown';

it('sanitiza con packages/markdown y solo los links externos abren en otra pestaña', () => {
  const html = renderPostMarkdown('[a](https://otro.example) [b](/posts/x) <img src=x onerror=alert(1)>');

  expect(html).toContain('<a href="https://otro.example" target="_blank" rel="noopener noreferrer">a</a>');
  expect(html).toContain('<a href="/posts/x">b</a>');
  expect(html).not.toContain('onerror');
});
