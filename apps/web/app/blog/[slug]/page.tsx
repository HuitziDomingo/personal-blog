import { Box, Heading, HStack, Link, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { AuthorCard } from '@/components/author-card';
import { ArrowLeftIcon, ClockIcon } from '@/components/icons';
import { PostBody } from '@/components/post-body';
import { TagList } from '@/components/tag-list';
import { postsApi } from '@/lib/api';
import { prerenderLimit, siteUrl } from '@/lib/config';
import { formatDate } from '@/lib/format';
import { renderPost } from '@/lib/markdown';
import { formatReadingTime, readingMinutes } from '@/lib/reading-time';
import { coverImage, pageMetadata } from '@/lib/seo';
import { siteDescription } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;
// Los posts que no se pregeneran se generan en su primera visita.
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * El post y su HTML, una vez por render: generateMetadata y la página lo
 * comparten. La petición ya la deduplica la caché de fetch; esto evita además
 * sanitizar dos veces.
 */
const loadPost = cache(async (slug: string) => {
  // Solo un 404 de la API (o un slug inválido o no publicado) da null;
  // un 429 o un 5xx lanza ApiUnavailableError y Next conserva la página anterior.
  const post = await postsApi.getPublished(slug);
  if (!post) {
    return null;
  }

  // El único HTML de usuario de la página, sanitizado en el servidor con la
  // allowlist de packages/markdown (ADR-010, punto 4; ADR-017, punto 5).
  return { post, ...renderPost(post.content) };
});

/** Pregenera solo los N posts más recientes (ADR-020); ver prerenderLimit. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await postsApi.publishedSlugs();

  return slugs.slice(0, prerenderLimit()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const loaded = await loadPost((await params).slug);
  if (!loaded) {
    return {};
  }
  const { post, cover } = loaded;
  const image = coverImage(cover, siteUrl());

  return pageMetadata({
    title: post.seo?.title ?? post.title,
    description: post.seo?.description ?? post.excerpt ?? siteDescription,
    path: `/blog/${post.slug}`,
    type: 'article',
    ...(image ? { image } : {}),
    ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
    modifiedTime: post.updatedAt,
    tags: post.tags,
  });
}

export default async function PostPage({ params }: PageProps) {
  const loaded = await loadPost((await params).slug);
  if (!loaded) {
    notFound();
  }
  const { post, html } = loaded;

  return (
    <Box as="article" maxW="70ch" mx="auto">
      <Stack gap="5" mb="10">
        <Link asChild color="brand.link" fontSize="sm" display="inline-flex" alignItems="center" gap="1" w="fit-content">
          <NextLink href="/blog">
            <ArrowLeftIcon /> Blog
          </NextLink>
        </Link>
        <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800" lineHeight="1.2">
          {post.title}
        </Heading>
        <HStack gap="3" color="fg.muted" fontSize="sm" wrap="wrap">
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
          {post.publishedAt && <span aria-hidden="true">·</span>}
          <HStack as="span" gap="1">
            <ClockIcon />
            <Text as="span">{formatReadingTime(readingMinutes(post.content))}</Text>
          </HStack>
        </HStack>
        <TagList tags={post.tags} />
      </Stack>

      <PostBody html={html} />

      <Box mt="12">
        <AuthorCard />
      </Box>
    </Box>
  );
}
