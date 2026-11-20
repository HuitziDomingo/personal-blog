import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AURORA_BLOBS } from '@/lib/aurora';

import { Aurora } from './aurora';

describe('Aurora', () => {
  const html = renderToStaticMarkup(<Aurora />);

  it('es decorativa: oculta para los lectores de pantalla', () => {
    expect(html).toMatch(/^<div class="aurora" aria-hidden="true">/);
  });

  it('una capa por mancha, con su color y sus opacidades por modo', () => {
    expect(html.match(/<span /g)).toHaveLength(AURORA_BLOBS.length);
    expect(html).toContain('--aurora-rgb:245 165 36');
    expect(html).toContain('--aurora-alpha-light:0.11');
    expect(html).toContain('--aurora-alpha-dark:0.08');
  });

  it('las de la derecha se desplazan hacia la izquierda', () => {
    expect(html).toMatch(/right:calc\(-12vw - min\(64vw, 100vh\) \/ 2\)[^"]*--aurora-dx:-6vw/);
  });
});
