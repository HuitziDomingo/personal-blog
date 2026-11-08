import { postsApi } from '@/lib/api';
import { siteUrl } from '@/lib/config';
import { buildRss } from '@/lib/rss';
import { profile, siteDescription } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

/**
 * RSS de los posts publicados. Usa la misma petición que /blog. Un 429 o un
 * 5xx lanza: Next conserva el último feed bueno, nunca publica uno vacío.
 */
export async function GET(): Promise<Response> {
  const page = await postsApi.listPublished();
  const xml = buildRss({ title: `Blog de ${profile.shortName}`, description: siteDescription, siteUrl: siteUrl() }, page.items);

  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
