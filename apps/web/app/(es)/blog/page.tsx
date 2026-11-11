import { BlogListing } from '@/components/blog-listing';
import { postsApi } from '@/lib/api';
import { POSTS_PER_PAGE, totalPages } from '@/lib/pagination';
import { pageMetadata } from '@/lib/seo';
import { siteDescription } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export const metadata = pageMetadata({ title: 'Blog', description: siteDescription, path: '/blog' });

export default async function BlogPage() {
  const page = await postsApi.listPublished({ limit: POSTS_PER_PAGE, offset: 0 });

  return <BlogListing posts={page.items} current={1} total={totalPages(page.total)} />;
}
