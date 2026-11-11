import { Badge, Box, Heading, HStack, Link, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import Image from 'next/image';
import NextLink from 'next/link';

import { ExternalLink } from '@/components/external-link';
import { ChevronRightIcon } from '@/components/icons';
import { glassTeal, palette } from '@/lib/brand';
import { localizedPath } from '@/lib/content/routes';
import type { SiteContent } from '@/lib/content/types';
import { pageMetadata } from '@/lib/seo';
import type { Work } from '@/lib/site';

export function workMetadata(content: SiteContent, work: Work): Metadata {
  const text = content.works[work.id];
  const cover = work.images[0];
  const coverAlt = text.imageAlts[0];
  const path = `/works/${work.id}`;

  return pageMetadata({
    title: work.title,
    description: text.summary,
    path: localizedPath(content.locale, path),
    locale: content.locale,
    ogLocale: content.ogLocale,
    languages: { es: path, en: localizedPath('en', path) },
    ...(cover && coverAlt !== undefined ? { image: { url: cover.src, alt: coverAlt } } : {}),
  });
}

/** Página de un trabajo en un idioma. */
export function WorkView({ content, work }: { content: SiteContent; work: Work }) {
  const text = content.works[work.id];
  const { ui } = content;

  return (
    <Stack as="article" gap="8">
      <Box as="nav" aria-label={ui.works.breadcrumb} fontSize="sm">
        <HStack as="ol" listStyleType="none" gap="1" color="fg.muted">
          <li>
            <Link asChild color="brand.link">
              <NextLink href={localizedPath(content.locale, '/works')}>{ui.works.title}</NextLink>
            </Link>
          </li>
          <Box as="li" aria-hidden="true" display="inline-flex">
            <ChevronRightIcon />
          </Box>
          <li>
            <span aria-current="page">{work.title}</span>
          </li>
        </HStack>
      </Box>

      <HStack gap="3" align="center" wrap="wrap">
        <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800">
          {work.heading}
        </Heading>
        <Badge bg="bg.muted" color="fg" fontSize="sm">
          {work.year}
        </Badge>
      </HStack>

      {text.sections.map((paragraphs, index) => {
        const image = work.images[index];
        const alt = text.imageAlts[index] ?? '';

        return (
          // Las secciones no cambian de orden: el índice es una key estable.
          <Stack as="section" key={index} gap="5">
            <Stack gap="3" lineHeight="1.75">
              {paragraphs.map((paragraph) => (
                <Text key={paragraph}>{paragraph}</Text>
              ))}
            </Stack>
            {index === 0 && (
              <HStack gap="3" wrap="wrap">
                <Badge bg={glassTeal} color={palette.light.fg} textTransform="uppercase">
                  {ui.works.website}
                </Badge>
                <ExternalLink href={work.link.href}>{work.link.label}</ExternalLink>
              </HStack>
            )}
            {image && (
              <Image
                src={image}
                alt={alt}
                placeholder="blur"
                priority={index === 0}
                sizes="(min-width: 896px) 848px, 100vw"
                style={{ width: '100%', height: 'auto', borderRadius: '0.75rem' }}
              />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
