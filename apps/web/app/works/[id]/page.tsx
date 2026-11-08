import { Badge, Box, Heading, HStack, Link, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import Image from 'next/image';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';

import { ExternalLink } from '@/components/external-link';
import { ChevronRightIcon } from '@/components/icons';
import { glassTeal, palette } from '@/lib/brand';
import { pageMetadata } from '@/lib/seo';
import { findWork, works } from '@/lib/site';

// Solo existen los trabajos de lib/site.ts: cualquier otro id es 404.
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams(): { id: string }[] {
  return works.map((work) => ({ id: work.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const work = findWork((await params).id);
  if (!work) {
    return {};
  }
  const cover = work.sections[0]?.image;

  return pageMetadata({
    title: work.title,
    description: work.summary,
    path: `/works/${work.id}`,
    ...(cover ? { image: { url: cover.src.src, alt: cover.alt } } : {}),
  });
}

export default async function WorkPage({ params }: PageProps) {
  const work = findWork((await params).id);
  if (!work) {
    notFound();
  }

  return (
    <Stack as="article" gap="8">
      <Box as="nav" aria-label="Migas de pan" fontSize="sm">
        <HStack as="ol" listStyleType="none" gap="1" color="fg.muted">
          <li>
            <Link asChild color="brand.link">
              <NextLink href="/works">Trabajos</NextLink>
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

      {work.sections.map((section, index) => (
        <Stack as="section" key={section.image.alt} gap="5">
          <Stack gap="3" lineHeight="1.75">
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph}>{paragraph}</Text>
            ))}
          </Stack>
          {index === 0 && (
            <HStack gap="3" wrap="wrap">
              <Badge bg={glassTeal} color={palette.light.fg} textTransform="uppercase">
                Website
              </Badge>
              <ExternalLink href={work.link.href}>{work.link.label}</ExternalLink>
            </HStack>
          )}
          <Image
            src={section.image.src}
            alt={section.image.alt}
            placeholder="blur"
            priority={index === 0}
            sizes="(min-width: 896px) 848px, 100vw"
            style={{ width: '100%', height: 'auto', borderRadius: '0.75rem' }}
          />
        </Stack>
      ))}
    </Stack>
  );
}
