// @ts-check
import { Badge, Box, Heading, HStack, Stack, Text } from '@chakra-ui/react';
import { notFound } from 'next/navigation';

import { formatDate } from '@/components/format';
import { getPublishedPost } from '@/lib/api';
import { renderMarkdown } from '@/lib/render-markdown';

// Next exige un literal en la configuración de segmento: debe coincidir con
// REVALIDATE_SECONDS de lib/api.js.
export const revalidate = 60;

// ISR en una ruta dinámica: generateStaticParams la vuelve estática. Con una
// lista vacía el build no llama a la API, y cada slug se genera en su primera
// visita y queda en caché (dynamicParams = true).
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

/** @typedef {{ params: Promise<{ slug: string }> }} PageProps */

/** @param {PageProps} props @returns {Promise<import('next').Metadata>} */
export async function generateMetadata({ params }) {
  const post = await getPublishedPost((await params).slug);
  if (!post) {
    return {};
  }
  return {
    title: post.seo?.title ?? post.title,
    description: post.seo?.description ?? post.excerpt,
  };
}

/** @param {PageProps} props */
export default async function PostPage({ params }) {
  const post = await getPublishedPost((await params).slug);
  if (!post) {
    notFound();
  }

  // El único HTML de usuario de la página: sale de renderMarkdown, sanitizado
  // con la allowlist (ADR-010, punto 4).
  const html = renderMarkdown(post.content);

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
