// @vitest-environment node
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

import { createServerRenderer } from './server.ts';
import { describeSanitization } from './test/sanitization-suite.ts';

it('corre sin window global, como en un servidor', () => {
  expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
});

const parser = new JSDOM('').window.document;

describeSanitization('servidor', createServerRenderer({ siteUrl: 'https://huitzi.xyz', newTab: 'all' }), (html) => {
  const container = parser.createElement('div');
  container.innerHTML = html;
  return container;
});
