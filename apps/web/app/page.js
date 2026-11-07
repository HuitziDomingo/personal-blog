// @ts-check
import { Badge, Heading, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { formatDate } from '@/components/format';
import { listPublishedPosts, REVALIDATE_SECONDS } from '@/lib/api';

// ISR: la lista se genera en el servidor y se regenera como mucho cada minuto.
export const revalidate = REVALIDATE_SECONDS;

export default async function HomePage() {
  const page = await listPublishedPosts();

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
                    <NextLink href={`/posts/${encodeURIComponent(post.slug)}`}>{post.title}</NextLink>
                  </LinkOverlay>
                </Heading>
                {post.publishedAt && (
                  <Text as="time" dateTime={post.publishedAt} color="fg.muted" fontSize="sm">
                    {formatDate(post.publishedAt)}
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
