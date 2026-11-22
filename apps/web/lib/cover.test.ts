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

  describe('portadas propias del sitio (posts migrados)', () => {
    const siteEnv = { ...env, SITE_URL: 'https://huitzi.xyz' };
    const own = { url: 'https://huitzi.xyz/img/blog/arreglos-portada.webp', alt: 'Código.', aiGenerated: false };

    it('acepta /img/blog/ del propio sitio y la devuelve como ruta local', () => {
      expect(displayableCover(own, siteEnv)).toEqual({ ...own, url: '/img/blog/arreglos-portada.webp' });
    });

    it('funciona aunque no haya COVER_IMAGES_BASE_URL', () => {
      expect(displayableCover(own, { SITE_URL: 'https://huitzi.xyz' })).toEqual({ ...own, url: '/img/blog/arreglos-portada.webp' });
    });

    it('con SITE_URL local, acepta la de localhost (base local de León)', () => {
      const local = { ...own, url: 'http://localhost:3000/img/blog/init.webp' };
      expect(displayableCover(local, { SITE_URL: 'http://localhost:3000' })?.url).toBe('/img/blog/init.webp');
    });

    it.each([
      ['otro origen con la misma ruta', 'https://evil.example/img/blog/arreglos-portada.webp'],
      ['http en lugar de https', 'http://huitzi.xyz/img/blog/arreglos-portada.webp'],
      ['subdominio', 'https://admin.huitzi.xyz/img/blog/arreglos-portada.webp'],
      ['fuera de /img/blog/', 'https://huitzi.xyz/img/works/youtube.webp'],
      ['subcarpeta', 'https://huitzi.xyz/img/blog/a/b.webp'],
      ['salida con ..', 'https://huitzi.xyz/img/blog/../og.png'],
      ['codificada', 'https://huitzi.xyz/img/blog/%2e%2e%2fog.png'],
      ['sin extensión de imagen', 'https://huitzi.xyz/img/blog/feed.xml'],
      ['con consulta', 'https://huitzi.xyz/img/blog/init.webp?w=1'],
      ['con credenciales', 'https://user@huitzi.xyz/img/blog/init.webp'],
    ])('ignora %s', (_, url) => {
      expect(displayableCover({ ...own, url }, siteEnv)).toBeNull();
    });
  });

  it('la leyenda está en español, el idioma del blog (ADR-024)', () => {
    expect(AI_COVER_CAPTION).toBe('Imagen generada con IA');
  });
});
