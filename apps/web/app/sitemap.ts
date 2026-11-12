import type { MetadataRoute } from 'next';

import { postsApi } from '@/lib/api';
import { RULES_PATH } from '@/components/comments/rules-path';
import { commentsEnabled, siteUrl } from '@/lib/config';
import { sitemapEntries } from '@/lib/seo';
import { works } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // La misma petición que generateStaticParams de los posts (caché de Next).
  const posts = await postsApi.publishedSummaries();

  return sitemapEntries(
    siteUrl(),
    works.map((work) => work.id),
    posts,
    commentsEnabled() ? RULES_PATH : undefined,
  );
}
