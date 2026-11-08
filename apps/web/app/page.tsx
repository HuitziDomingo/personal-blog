import { Badge, Heading, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { postsApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export default async function HomePage() {
  const page = await postsApi.listPublished();

  return (
    <Stack gap="8">
      <Heading as="h1" size="3xl">
        Posts
      </Heading>
      {page.items.length === 0 ? (
        <Text color="fg.muted">Todavía no hay posts publicados.</Text>
      ) : (
        <Stack as="ul" gap="6" listStyleType="none">
          {page.items.map((post) => (
            <LinkBox as="li" key={post.id} borderWidth="1px" borderRadius="lg" p="5">
              <Stack gap="2">
                <Heading as="h2" size="lg">
                  <LinkOverlay asChild>
                    <NextLink href={`/posts/${post.slug}`}>{post.title}</NextLink>
                  </LinkOverlay>
                </Heading>
                {post.publishedAt && (
                  <Text asChild color="fg.muted" fontSize="sm">
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  </Text>
                )}
                {post.excerpt && <Text>{post.excerpt}</Text>}
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
            </LinkBox>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
