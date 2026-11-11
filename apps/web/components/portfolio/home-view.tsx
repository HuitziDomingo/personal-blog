import { Box, Button, Flex, Heading, Link, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import Image from 'next/image';
import NextLink from 'next/link';

import perfil from '@/assets/img/perfil.webp';
import { SocialIcon } from '@/components/brand-icons';
import { ExternalLink } from '@/components/external-link';
import { ChevronRightIcon } from '@/components/icons';
import { PostCard } from '@/components/post-card';
import { SectionHeading } from '@/components/section-heading';
import type { PostSummary } from '@/lib/api';
import { glassTeal, palette } from '@/lib/brand';
import { localizedPath } from '@/lib/content/routes';
import type { SiteContent } from '@/lib/content/types';
import { pageMetadata } from '@/lib/seo';
import { profile, socialLinks } from '@/lib/site';

import { WithDebredLink } from './with-debred-link';

/** Portada en un idioma: saludo, «Acerca de mí», biografía, posts y redes. */
export function HomeView({ content, latest }: { content: SiteContent; latest: readonly PostSummary[] }) {
  const { profile: text, ui } = content;

  return (
    <Stack gap={{ base: '12', md: '16' }} maxW="3xl" mx="auto">
      <Stack gap="6">
        <Box bg="brand.surface" borderWidth="1px" borderRadius="xl" px="4" py="3" textAlign="center">
          {text.greeting}
        </Box>

        <Flex direction={{ base: 'column-reverse', sm: 'row' }} gap="6" align={{ base: 'start', sm: 'center' }}>
          <Stack gap="3" flex="1">
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800" lineHeight="1.15">
              {profile.name}
            </Heading>
            <Text fontFamily="mono" fontSize="sm" color="fg.muted">
              {`<${text.tagline}>`}
            </Text>
          </Stack>
          <Box flexShrink={0} borderRadius="full" borderWidth="3px" borderColor="brand.accent" overflow="hidden">
            <Image
              src={perfil}
              alt={ui.home.photoAlt}
              width={112}
              height={112}
              priority
              placeholder="blur"
              style={{ objectFit: 'cover', width: '112px', height: '112px' }}
            />
          </Box>
        </Flex>
      </Stack>

      <Box as="section" aria-labelledby="acerca">
        <SectionHeading id="acerca">{ui.home.about}</SectionHeading>
        <Stack gap="4" lineHeight="1.75">
          {content.about.map((paragraph) => (
            <Text key={paragraph}>
              <WithDebredLink text={paragraph} />
            </Text>
          ))}
        </Stack>
        <Flex justify="center" mt="6">
          <Button asChild bg={glassTeal} color={palette.light.fg} _hover={{ opacity: 0.9 }} size="md">
            <NextLink href={localizedPath(content.locale, '/works')}>
              {ui.home.worksButton} <ChevronRightIcon />
            </NextLink>
          </Button>
        </Flex>
      </Box>

      <Box as="section" aria-labelledby="biografia">
        <SectionHeading id="biografia">{ui.home.bio}</SectionHeading>
        <Box as="ol" listStyleType="none" borderInlineStartWidth="2px" borderColor="border" ms="1">
          {content.bio.map((entry) => (
            <Box as="li" key={entry.period} position="relative" ps="5" pb="5" _last={{ pb: '0' }}>
              <Box
                aria-hidden="true"
                position="absolute"
                left="-7px"
                top="0.45em"
                boxSize="12px"
                borderRadius="full"
                bg="brand.accent"
              />
              <Text fontWeight="bold">
                <Box as="span" color="brand.accent" me="2">
                  {entry.period}
                </Box>
                <WithDebredLink text={entry.title} />
              </Text>
              {entry.description && (
                <Text color="fg.muted" mt="1" lineHeight="1.7">
                  {entry.description}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      <Box as="section" aria-labelledby="ultimos-posts">
        <SectionHeading id="ultimos-posts">{ui.home.latestPosts}</SectionHeading>
        {latest.length === 0 ? (
          <Text color="fg.muted">{ui.home.noPosts}</Text>
        ) : (
          // Los posts están en español, aunque la portada sea en inglés.
          <Stack gap="4" lang="es">
            {latest.map((post, index) => (
              <PostCard key={post.id} post={post} headingLevel="h3" index={index} dateLocale={content.intlLocale} />
            ))}
          </Stack>
        )}
        <Link asChild color="brand.link" mt="4" display="inline-flex" alignItems="center" gap="1">
          <NextLink href="/blog">
            {ui.home.allPosts} <ChevronRightIcon />
          </NextLink>
        </Link>
      </Box>

      <Box as="section" aria-labelledby="en-la-web">
        <SectionHeading id="en-la-web">{ui.home.onTheWeb}</SectionHeading>
        <Box as="ul" listStyleType="none" display="grid" gridTemplateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap="3">
          {socialLinks.map((link) => (
            <li key={link.network}>
              <ExternalLink
                href={link.href}
                display="flex"
                alignItems="center"
                gap="2"
                px="4"
                py="3"
                borderWidth="1px"
                borderRadius="lg"
                bg="brand.surface"
                textDecoration="none"
                _hover={{ borderColor: 'brand.accent', textDecoration: 'none' }}
              >
                <SocialIcon network={link.network} style={{ flexShrink: 0 }} />
                <Box as="span" fontWeight="semibold" color="fg">
                  {link.network}
                </Box>
                <Box as="span">{link.label}</Box>
              </ExternalLink>
            </li>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}

export function homeMetadata(content: SiteContent): Metadata {
  return {
    ...pageMetadata({
      title: profile.shortName,
      description: content.profile.greeting,
      path: localizedPath(content.locale, '/'),
      locale: content.locale,
      ogLocale: content.ogLocale,
      languages: { es: '/', en: localizedPath('en', '/') },
    }),
    // La portada no usa la plantilla «%s · Huitzitzili León».
    title: { absolute: profile.name },
  };
}
