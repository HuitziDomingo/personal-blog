// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './index.ts';
import { createServerRenderer } from './server.ts';
import { allCases } from './test/sanitization-suite.ts';

// La página de jsdom es https://huitzi.xyz/ (vitest.config.ts): el mismo
// origen que el siteUrl del servidor.
const renderOnServer = createServerRenderer({ siteUrl: 'https://huitzi.xyz' });

describe('las dos variantes producen el mismo HTML', () => {
  it('con la página y el sitio en el mismo origen', () => {
    expect(window.location.origin).toBe('https://huitzi.xyz');
  });

  it.each(allCases())('%s', (_name, source) => {
    expect(renderOnServer(source)).toBe(renderMarkdown(source));
  });
});
