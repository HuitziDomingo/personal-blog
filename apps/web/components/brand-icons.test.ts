import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { socialLinks } from '@/lib/site';

import { SocialIcon } from './brand-icons';

describe('SocialIcon', () => {
  it.each(socialLinks.map((link) => link.network))('%s tiene un ícono decorativo', (network) => {
    const html = renderToStaticMarkup(createElement(SocialIcon, { network }));

    expect(html).toMatch(/^<svg /);
    // Decorativo: el nombre de la red lo da el texto del link.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain('<title');
    // Hereda el color del link, que ya cumple AA.
    expect(html).toContain('currentColor');
  });

  it('no pinta nada para una red sin ícono', () => {
    expect(renderToStaticMarkup(createElement(SocialIcon, { network: 'Otra' }))).toBe('');
  });
});
