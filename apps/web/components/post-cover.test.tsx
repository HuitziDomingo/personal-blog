import { ChakraProvider } from '@chakra-ui/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { system } from './theme/system';
import { PostCover } from './post-cover';

vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, style }: { src: string; alt: string; width: number; height: number; style?: React.CSSProperties }) => (
    <img src={src} alt={alt} width={width} height={height} style={style} />
  ),
}));

const url = 'https://storage.googleapis.com/test-bucket/covers/abc/def.jpg';

function render(aiGenerated: boolean): string {
  return renderToStaticMarkup(
    <ChakraProvider value={system}>
      <PostCover cover={{ url, alt: 'Robots que arman una tubería.', aiGenerated }} />
    </ChakraProvider>,
  );
}

describe('PostCover', () => {
  it('muestra la imagen de 1024 × 576 con su texto alternativo', () => {
    const html = render(true);

    expect(html).toContain(`src="${url}"`);
    expect(html).toContain('alt="Robots que arman una tubería."');
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="576"');
  });

  it('recorta al centro a 16:9 una imagen de otra proporción', () => {
    const html = render(true);

    expect(html).toContain('aspect-ratio:16 / 9');
    expect(html).toContain('object-fit:cover');
  });

  it('con una portada generada con IA, la leyenda (ADR-026, punto 6)', () => {
    expect(render(true)).toMatch(/<figcaption[^>]*>Imagen generada con IA<\/figcaption>/);
  });

  it('sin IA, sin leyenda', () => {
    const html = render(false);

    expect(html).not.toContain('Imagen generada con IA');
    expect(html).not.toContain('<figcaption');
  });
});
