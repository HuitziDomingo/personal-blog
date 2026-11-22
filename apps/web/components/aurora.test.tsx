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

  it('una mancha por blob, con dos capas de tono', () => {
    expect(html.match(/<span /g)).toHaveLength(AURORA_BLOBS.length);
    expect(html.match(/<i><\/i>/g)).toHaveLength(AURORA_BLOBS.length * 2);
  });

  it('pasa a CSS los tonos y alfas de cada modo y de móvil', () => {
    const [blob] = AURORA_BLOBS;
    if (!blob) throw new Error('sin manchas');
    expect(html).toContain(`--aurora-alpha-light:${String(blob.alpha.light)}`);
    expect(html).toContain(`--aurora-alpha-dark:${String(blob.alpha.dark)}`);
    expect(html).toContain(`--aurora-alpha-mobile-light:${String(blob.alpha.mobileLight)}`);
    expect(html).toContain(`--aurora-alpha-mobile-dark:${String(blob.alpha.mobileDark)}`);
    expect(html).toContain(`--aurora-dx:${String(blob.drift)}vw`);
    expect(html).toContain(`--aurora-tone-duration:${String(blob.toneDuration)}s`);
  });

  it('el alfa de móvil vale por debajo del md de Chakra', () => {
    expect(css['.aurora > span']).toHaveProperty([`@media (max-width: ${String(AURORA_MOBILE_MAX_PX - 0.02)}px)`]);
  });

  it('el body no tiene fondo propio: taparía la capa de z-index -1', () => {
    expect(system._config.globalCss?.body).toMatchObject({ bg: 'transparent' });
  });

  it.each(['aurora-deriva', 'aurora-tono-sale', 'aurora-tono-entra'])('%s solo anima transform y opacity', (name) => {
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

  it('con reduced-motion no hay animación y queda el primer tono', () => {
    for (const selector of ['.aurora > span', '.aurora > span > i', '.aurora > span > i:first-of-type', '.aurora > span > i:last-of-type']) {
      const rule = css[selector] ?? {};
      expect(Object.keys(rule).some((k) => k.startsWith('animation')), selector).toBe(false);
    }
    expect(css['.aurora > span > i:last-of-type']).toMatchObject({ opacity: '0' });
  });
});
