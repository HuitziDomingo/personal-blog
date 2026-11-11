import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { BlogListing } from '@/components/blog-listing';
import { postsApi } from '@/lib/api';
import { pageHref, pageOffset, parsePageParam, POSTS_PER_PAGE, totalPages } from '@/lib/pagination';
import { pageMetadata } from '@/lib/seo';
import { siteDescription } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;
// Las páginas se generan al pedirlas (ver generateStaticParams).
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ n: string }>;
}

/**
 * Ninguna página se pregenera: cada una sería una petición más del build a
 * la API, y su ráfaga es limitada (ADR-020). Se generan en la primera visita
 * y quedan en caché con ISR, como los posts que no se pregeneran.
 */
export function generateStaticParams(): { n: string }[] {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePageParam((await params).n);
  if (page === null || page === 1) {
    return {};
  }

  // Canónica propia: cada página lista posts distintos, no es un duplicado
  // de /blog.
  return pageMetadata({
    title: `Blog, página ${String(page)}`,
    description: siteDescription,
    path: pageHref(page),
  });
}

export default async function BlogPageN({ params }: PageProps) {
  const page = parsePageParam((await params).n);
  if (page === null) {
    notFound();
  }
  if (page === 1) {
    permanentRedirect('/blog');
  }

  const result = await postsApi.listPublished({ limit: POSTS_PER_PAGE, offset: pageOffset(page) });
  const total = totalPages(result.total);
  if (page > total) {
    notFound();
  }

  return <BlogListing posts={result.items} current={page} total={total} />;
}
