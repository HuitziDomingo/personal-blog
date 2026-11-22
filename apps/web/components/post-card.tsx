import { Heading, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import type { PostSummary } from '@/lib/api';
import { displayableCover } from '@/lib/cover';
import { formatDate } from '@/lib/format';

import { BlurImage } from './blur-image';
import { entrance } from './entrance';
import { COVER_HEIGHT, COVER_WIDTH } from './post-cover';
import { TagList } from './tag-list';

export function PostCard({
  post,
  headingLevel = 'h2',
  index = 0,
  dateLocale,
}: {
  post: PostSummary;
  headingLevel?: 'h2' | 'h3';
  /** Posición en la lista, para escalonar la entrada. */
  index?: number;
  /** Locale de `Intl` para la fecha; por defecto, español de México. */
  dateLocale?: string;
}) {
  const cover = displayableCover(post.cover);

  return (
    <LinkBox
      as="article"
      bg="brand.surface"
      borderWidth="1px"
      borderRadius="xl"
      p={{ base: '5', md: '6' }}
      transition="border-color 0.2s, transform 0.2s"
      _hover={{ borderColor: 'brand.accent' }}
      _focusWithin={{ borderColor: 'brand.accent' }}
      css={entrance(index)}
    >
      {cover && (
        // Decorativa: el título del enlace ya nombra el post.
        <BlurImage
          src={cover.url}
          alt=""
          {...(cover.blurDataUrl ? { blurDataURL: cover.blurDataUrl } : {})}
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
          sizes="(min-width: 768px) 46rem, calc(100vw - 2rem)"
          style={{ width: '100%', height: 'auto', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }}
          wrapperStyle={{ borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem' }}
        />
      )}
      <Stack gap="2">
        {post.publishedAt && (
          <Text asChild color="fg.muted" fontSize="sm">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, dateLocale)}</time>
          </Text>
        )}
        <Heading as={headingLevel} fontSize={{ base: 'lg', md: 'xl' }} lineHeight="short">
          <LinkOverlay asChild>
            <NextLink href={`/blog/${post.slug}`}>{post.title}</NextLink>
          </LinkOverlay>
        </Heading>
        {post.excerpt && <Text color="fg.muted">{post.excerpt}</Text>}
        <TagList tags={post.tags} />
      </Stack>
    </LinkBox>
  );
}
