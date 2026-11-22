import type { Post } from './api';
import { coverImagesBaseUrl, siteUrl, type Env } from './config';

export type Cover = NonNullable<Post['cover']>;

/** Leyenda de una portada generada con IA (ADR-026, punto 6). El blog es solo en español (ADR-024). */
export const AI_COVER_CAPTION = 'Imagen generada con IA';

/**
 * Imágenes propias del sitio que pueden ser portada: las de los posts
 * migrados de la web anterior, en public/img/blog/ (cmd/migrate-covers de la
 * API). Solo un nombre de archivo simple con extensión de imagen, sin
 * subcarpetas, puntos dobles ni consulta.
 */
const OWN_COVER_PATH = /^\/img\/blog\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpe?g|avif)$/;

/**
 * La portada del post si se puede mostrar con next/image, o null. Vale:
 *
 * - una URL bajo COVER_IMAGES_BASE_URL (las generadas, en el almacén);
 * - una URL del propio sitio (`SITE_URL`) bajo /img/blog/, que se devuelve
 *   como ruta relativa para que next/image la trate como imagen local, sin
 *   agregar el sitio a `remotePatterns`.
 *
 * Con cualquier otra next/image fallaría al renderizar, y un post sin portada
 * se publica igual (ADR-026, punto 5).
 */
export function displayableCover(cover: Post['cover'], env: Env = process.env): Cover | null {
  if (!cover) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(cover.url);
  } catch {
    return null;
  }
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    return null;
  }

  const base = coverImagesBaseUrl(env);
  if (base !== null && url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
    return cover;
  }

  if (url.origin === new URL(siteUrl(env)).origin && OWN_COVER_PATH.test(url.pathname)) {
    return { ...cover, url: url.pathname };
  }

  return null;
}
