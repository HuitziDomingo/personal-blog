// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createBrowserRenderer } from './index.ts';
import type { NewTabPolicy } from './policy.ts';
import { createServerRenderer } from './server.ts';
import { allCases } from './test/sanitization-suite.ts';

it('la página y el sitio están en el mismo origen', () => {
  // La página de jsdom es https://huitzi.xyz/ (vitest.config.ts).
  expect(window.location.origin).toBe('https://huitzi.xyz');
});

describe.each<NewTabPolicy>(['all', 'external'])('las dos variantes producen el mismo HTML (newTab: %s)', (newTab) => {
  const inBrowser = createBrowserRenderer({ newTab });
  const onServer = createServerRenderer({ siteUrl: 'https://huitzi.xyz', newTab });

  it.each(allCases())('%s', (_name, source) => {
    expect(onServer(source)).toBe(inBrowser(source));
  });
});
