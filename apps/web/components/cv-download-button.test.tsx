import { describe, expect, it } from 'vitest';

import { system } from './theme/system';

describe('brillo de «Descargar CV» (BLOG-152)', () => {
  const css = (system._config.globalCss ?? {}) as unknown as Record<string, Record<string, Record<string, Record<string, string>>>>;
  const motion = css['.cv-cta']?.['@media (prefers-reduced-motion: no-preference)'] ?? {};

  it('cruza una vez al cargar y otra en hover o foco, sin bucle', () => {
    expect(motion['&::before']?.animation).toMatch(/^brillo .* 1 both$/);
    expect(motion['&:hover::after, &:focus-visible::after']?.animation).toMatch(/^brillo .* 1$/);
    expect(JSON.stringify(css['.cv-cta'])).not.toMatch(/infinite/);
  });

  it('sin animación fuera de prefers-reduced-motion: no-preference', () => {
    const rest = Object.entries(css['.cv-cta'] ?? {}).filter(([key]) => key !== '@media (prefers-reduced-motion: no-preference)');
    expect(JSON.stringify(rest)).not.toMatch(/animation/);
  });

  it('el brillo solo anima transform', () => {
    const keyframes = system._config.theme?.keyframes?.['brillo'] ?? {};
    const props = new Set(Object.values(keyframes).flatMap((frame) => Object.keys(frame as object)));
    expect([...props]).toEqual(['transform']);
  });
});
