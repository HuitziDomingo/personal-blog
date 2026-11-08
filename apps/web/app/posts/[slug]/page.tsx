import { Badge, Box, Heading, HStack, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { postsApi } from '@/lib/api';
import { PRERENDER_LIMIT } from '@/lib/config';
import { formatDate } from '@/lib/format';
import { renderPostMarkdown } from '@/lib/markdown';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;
// Los posts que no se pregeneran se generan en su primera visita.
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Pregenera solo los posts más recientes; ver PRERENDER_LIMIT. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await postsApi.publishedSlugs();

  return slugs.slice(0, PRERENDER_LIMIT).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await postsApi.getPublished((await params).slug);
  if (!post) {
    return {};
  }

  return {
    title: post.seo?.title ?? post.title,
    description: post.seo?.description ?? post.excerpt ?? null,
  };
}

export default async function PostPage({ params }: PageProps) {
  // Solo un 404 de la API (o un slug inválido o no publicado) da notFound();
  // un 429 o un 5xx lanza ApiUnavailableError y Next conserva la página anterior.
  const post = await postsApi.getPublished((await params).slug);
  if (!post) {
    notFound();
  }

  // El único HTML de usuario de la página, sanitizado en el servidor con la
  // allowlist de packages/markdown (ADR-010, punto 4; ADR-017, punto 5).
  const html = renderPostMarkdown(post.content);

  return (
    <Stack as="article" gap="6">
      <Stack gap="2">
        <Heading as="h1" size="4xl">
          {post.title}
        </Heading>
        {post.publishedAt && (
          <Text asChild color="fg.muted">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </Text>
        )}
        {post.tags.length > 0 && (
          <HStack gap="2" wrap="wrap">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="subtle">
                {tag}
              </Badge>
            ))}
          </HStack>
        )}
      </Stack>
      <Box
        lineHeight="tall"
        css={{
          '& > * + *': { marginTop: '4' },
          '& h2': { fontSize: '2xl', fontWeight: 'semibold', marginTop: '8' },
          '& h3': { fontSize: 'xl', fontWeight: 'semibold', marginTop: '6' },
          '& a': { color: 'blue.600', textDecoration: 'underline' },
          '& ul, & ol': { paddingInlineStart: '6' },
          '& ul': { listStyleType: 'disc' },
          '& ol': { listStyleType: 'decimal' },
          '& pre': { bg: 'bg.muted', padding: '4', borderRadius: 'md', overflowX: 'auto' },
          '& code': { fontFamily: 'mono', fontSize: 'sm' },
          '& blockquote': { borderInlineStartWidth: '4px', paddingInlineStart: '4', color: 'fg.muted' },
          '& img': { maxWidth: '100%', height: 'auto' },
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Stack>
  );
}
