import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BlurImage, blurPlaceholderStyle } from './blur-image';

const blur = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const remote = { src: '/img/blog/init.webp', alt: 'Captura', width: 1024, height: 576 };

describe('blurPlaceholderStyle', () => {
  it('con blurDataURL, el SVG borroso de next/image como fondo', () => {
    const style = blurPlaceholderStyle({ ...remote, blurDataURL: blur });

    expect(style.backgroundImage).toMatch(/^url\("data:image\/svg\+xml/);
    expect(style.backgroundImage).toContain('feGaussianBlur');
    expect(style.backgroundSize).toBeDefined();
  });

  it('sin blurDataURL en una imagen remota, nada', () => {
    expect(blurPlaceholderStyle(remote)).toEqual({});
  });

  it('con un import estático usa su miniatura', () => {
    const src = { src: '/_next/static/media/x.webp', width: 1600, height: 850, blurDataURL: blur, blurWidth: 8, blurHeight: 4 };

    expect(blurPlaceholderStyle({ src, alt: '' }).backgroundImage).toContain('feGaussianBlur');
  });
});

describe('BlurImage', () => {
  it('el placeholder va en el contenedor y el <img> sale sin fondo, visible desde el HTML del servidor', () => {
    const html = renderToStaticMarkup(<BlurImage {...remote} blurDataURL={blur} />);

    expect(html).toMatch(/^<span class="blur-up" style="background-image:url\(&quot;data:image\/svg\+xml/);
    const img = /<img[^>]*>/.exec(html)?.[0] ?? '';
    expect(img).not.toContain('background-image');
    // Sin JavaScript no se oculta nada: data-blur-loading solo lo pone el cliente.
    expect(img).not.toContain('data-blur-loading');
    expect(img).not.toContain('opacity');
  });

  it('agrega el estilo del contenedor', () => {
    const html = renderToStaticMarkup(<BlurImage {...remote} wrapperStyle={{ borderRadius: '9999px' }} />);

    expect(html).toContain('<span class="blur-up" style="border-radius:9999px">');
  });
});
