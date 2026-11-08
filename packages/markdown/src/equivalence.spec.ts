// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createBrowserRenderer } from './index';
import type { NewTabPolicy } from './policy';
import { createServerRenderer } from './server';
import { allCases } from './test/sanitization-suite';

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
