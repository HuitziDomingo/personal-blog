import type { Post } from './api';
import { coverImagesBaseUrl, type Env } from './config';

export type Cover = NonNullable<Post['cover']>;

/** Leyenda de una portada generada con IA (ADR-026, punto 6). El blog es solo en español (ADR-024). */
export const AI_COVER_CAPTION = 'Imagen generada con IA';

/**
 * La portada del post si se puede mostrar con next/image, o null. Solo vale
 * una URL bajo COVER_IMAGES_BASE_URL: con otra, next/image fallaría al
 * renderizar, y un post sin portada se publica igual (ADR-026, punto 5).
 */
export function displayableCover(cover: Post['cover'], env: Env = process.env): Cover | null {
  const base = coverImagesBaseUrl(env);
  if (!cover || base === null) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(cover.url);
  } catch {
    return null;
  }

  const underBase = url.origin === base.origin && url.pathname.startsWith(base.pathname) && url.search === '' && url.hash === '';

  return underBase ? cover : null;
}
