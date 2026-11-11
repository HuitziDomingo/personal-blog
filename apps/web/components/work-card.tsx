import { Heading, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import Image from 'next/image';
import NextLink from 'next/link';

import type { WorkText } from '@/lib/content/types';
import type { Work } from '@/lib/site';

import { entrance } from './entrance';

export function WorkCard({
  work,
  text,
  href,
  priority = false,
  index = 0,
}: {
  work: Work;
  text: WorkText;
  /** Página del trabajo en el idioma de la rejilla. */
  href: string;
  priority?: boolean;
  index?: number;
}) {
  const cover = work.images[0];

  return (
    <LinkBox
      as="article"
      className="group"
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      bg="brand.surface"
      css={entrance(index)}
    >
      {cover && (
        <Image
          src={cover}
          alt=""
          placeholder="blur"
          priority={priority}
          sizes="(min-width: 768px) 420px, 100vw"
          style={{ width: '100%', height: 'auto', aspectRatio: '16 / 9', objectFit: 'cover' }}
        />
      )}
      <Stack gap="1" p="4">
        <Heading as="h2" fontSize="lg">
          <LinkOverlay asChild _groupHover={{ color: 'brand.accent' }}>
            <NextLink href={href}>{work.title}</NextLink>
          </LinkOverlay>
        </Heading>
        <Text color="fg.muted" fontSize="sm">
          {text.summary}
        </Text>
      </Stack>
    </LinkBox>
  );
}
