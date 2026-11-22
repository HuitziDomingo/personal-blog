import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AURORA_BLOBS, AURORA_MOBILE_MAX_PX } from '@/lib/aurora';

import { Aurora } from './aurora';
import { system } from './theme/system';

describe('Aurora', () => {
  const html = renderToStaticMarkup(<Aurora />);
  const css = (system._config.globalCss ?? {}) as Record<string, Record<string, unknown>>;

  it('es decorativa: oculta para los lectores de pantalla', () => {
    expect(html).toMatch(/^<div class="aurora" aria-hidden="true">/);
  });

  it('una capa por mancha, sin capas de tono; las de escritorio marcadas', () => {
    expect(html.match(/<span /g)).toHaveLength(AURORA_BLOBS.length);
    expect(html).not.toContain('<i>');
    expect(html.match(/data-desktop=""/g)).toHaveLength(AURORA_BLOBS.filter((b) => !b.mobile).length);
  });

  it('en móvil no se pintan las manchas de escritorio', () => {
    expect(css['.aurora > span[data-desktop]']).toEqual({ '@media (max-width: 767.98px)': { display: 'none' } });
  });

  it('quieta en la portada: sin animación donde está data-aurora-quieta', () => {
    expect(css['body:has([data-aurora-quieta]) .aurora > span']).toMatchObject({ animation: 'none' });
  });

  it('pasa a CSS los tonos y alfas de cada modo y de móvil', () => {
    const [blob] = AURORA_BLOBS;
    if (!blob) throw new Error('sin manchas');
    expect(html).toContain(`--aurora-alpha-light:${String(blob.alpha.light)}`);
    expect(html).toContain(`--aurora-alpha-dark:${String(blob.alpha.dark)}`);
    expect(html).toContain(`--aurora-alpha-mobile-light:${String(blob.alpha.mobileLight)}`);
    expect(html).toContain(`--aurora-alpha-mobile-dark:${String(blob.alpha.mobileDark)}`);
    expect(html).toContain(`--aurora-dx:${String(blob.drift)}vw`);
    expect(html).toContain(`--aurora-tone-light:${[1, 3, 5].map((i) => Number.parseInt(blob.tone.light.slice(i, i + 2), 16)).join(' ')}`);
  });

  it('el alfa de móvil vale por debajo del md de Chakra', () => {
    expect(String(AURORA_MOBILE_MAX_PX - 0.02)).toBe('767.98');
    expect(css['.aurora > span']).toHaveProperty(['@media (max-width: 767.98px)']);
  });

  it('el body no tiene fondo propio: taparía la capa de z-index -1', () => {
    expect(system._config.globalCss?.body).toMatchObject({ bg: 'transparent' });
  });

  it.each(['aurora-deriva'])('%s solo anima transform y opacity', (name) => {
    const keyframes = system._config.theme?.keyframes?.[name] ?? {};
    const props = new Set(Object.values(keyframes).flatMap((frame) => Object.keys(frame as object)));

    expect(props.size).toBeGreaterThan(0);
    for (const prop of props) expect(['opacity', 'transform']).toContain(prop);
  });

  it('nada de la aurora usa filter', () => {
    for (const [selector, rule] of Object.entries(css)) {
      if (selector.startsWith('.aurora')) expect(JSON.stringify(rule)).not.toMatch(/filter/i);
    }
  });

  it('con reduced-motion no hay animación', () => {
    const rule = css['.aurora > span'] ?? {};
    expect(Object.keys(rule).some((k) => k.startsWith('animation'))).toBe(false);
  });
});
