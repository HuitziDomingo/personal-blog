import { describe, expect, it } from 'vitest';

import { AI_COVER_CAPTION, displayableCover } from './cover';

const env = { COVER_IMAGES_BASE_URL: 'https://storage.googleapis.com/test-bucket/covers' };
const cover = { url: 'https://storage.googleapis.com/test-bucket/covers/abc/def.jpg', alt: 'Robots.', aiGenerated: true };

describe('displayableCover (ADR-026)', () => {
  it('devuelve la portada bajo COVER_IMAGES_BASE_URL', () => {
    expect(displayableCover(cover, env)).toEqual(cover);
  });

  it('un post sin portada se publica igual', () => {
    expect(displayableCover(undefined, env)).toBeNull();
  });

  it('sin COVER_IMAGES_BASE_URL no muestra ninguna: next/image fallaría con un host no permitido', () => {
    expect(displayableCover(cover, {})).toBeNull();
  });

  it.each([
    ['otro bucket', 'https://storage.googleapis.com/other-bucket/covers/abc/def.jpg'],
    ['otro host', 'https://evil.example/test-bucket/covers/abc/def.jpg'],
    ['http en lugar de https', 'http://storage.googleapis.com/test-bucket/covers/abc/def.jpg'],
    ['prefijo parecido', 'https://storage.googleapis.com/test-bucket/covers-old/abc.jpg'],
    ['con consulta', 'https://storage.googleapis.com/test-bucket/covers/abc.jpg?x=1'],
    ['no es una URL', 'covers/abc.jpg'],
  ])('ignora una URL fuera del prefijo (%s)', (_, url) => {
    expect(displayableCover({ ...cover, url }, env)).toBeNull();
  });

  it('la leyenda está en español, el idioma del blog (ADR-024)', () => {
    expect(AI_COVER_CAPTION).toBe('Imagen generada con IA');
  });
});
