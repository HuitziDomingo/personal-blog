import { Box, Button, Flex, Heading, Link, Stack, Text } from '@chakra-ui/react';
import Image from 'next/image';
import NextLink from 'next/link';

import perfil from '@/assets/img/perfil.webp';
import { ExternalLink } from '@/components/external-link';
import { ChevronRightIcon } from '@/components/icons';
import { PostCard } from '@/components/post-card';
import { SectionHeading } from '@/components/section-heading';
import { postsApi } from '@/lib/api';
import { glassTeal, palette } from '@/lib/brand';
import { pageMetadata } from '@/lib/seo';
import { about, bio, debredUrl, profile, socialLinks } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

/** Posts recientes en la portada. */
const LATEST_POSTS = 3;

export const metadata = {
  ...pageMetadata({ title: profile.shortName, description: profile.greeting, path: '/' }),
  // La portada no usa la plantilla «%s · Huitzitzili León».
  title: { absolute: profile.name },
};

/** Texto de lib/site.ts con el link a Debred donde dice `{debred}`. */
function WithDebredLink({ text }: { text: string }) {
  const [before, after] = text.split('{debred}');
  if (after === undefined) {
    return text;
  }

  return (
    <>
      {before}
      <ExternalLink href={debredUrl}>Debred</ExternalLink>
      {after}
    </>
  );
}

export default async function HomePage() {
  // La misma petición que /blog: la caché de Next la comparte (ADR-020).
  const latest = (await postsApi.listPublished()).items.slice(0, LATEST_POSTS);

  return (
    <Stack gap={{ base: '12', md: '16' }} maxW="3xl" mx="auto">
      <Stack gap="6">
        <Box bg="brand.surface" borderWidth="1px" borderRadius="xl" px="4" py="3" textAlign="center">
          {profile.greeting}
        </Box>

        <Flex direction={{ base: 'column-reverse', sm: 'row' }} gap="6" align={{ base: 'start', sm: 'center' }}>
          <Stack gap="3" flex="1">
            <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800" lineHeight="1.15">
              {profile.name}
            </Heading>
            <Text fontFamily="mono" fontSize="sm" color="fg.muted">
              {`<${profile.tagline}>`}
            </Text>
          </Stack>
          <Box flexShrink={0} borderRadius="full" borderWidth="3px" borderColor="brand.accent" overflow="hidden">
            <Image
              src={perfil}
              alt={`Foto de ${profile.name}`}
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
        <SectionHeading id="acerca">Acerca de mí</SectionHeading>
        <Stack gap="4" lineHeight="1.75">
          {about.map((text) => (
            <Text key={text}>
              <WithDebredLink text={text} />
            </Text>
          ))}
        </Stack>
        <Flex justify="center" mt="6">
          <Button asChild bg={glassTeal} color={palette.light.fg} _hover={{ opacity: 0.9 }} size="md">
            <NextLink href="/works">
              Mis trabajos y proyectos <ChevronRightIcon />
            </NextLink>
          </Button>
        </Flex>
      </Box>

      <Box as="section" aria-labelledby="biografia">
        <SectionHeading id="biografia">Biografía</SectionHeading>
        <Box as="ol" listStyleType="none" borderInlineStartWidth="2px" borderColor="border" ms="1">
          {bio.map((entry) => (
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
        <SectionHeading id="ultimos-posts">Últimos posts</SectionHeading>
        {latest.length === 0 ? (
          <Text color="fg.muted">Todavía no hay posts publicados.</Text>
        ) : (
          <Stack gap="4">
            {latest.map((post) => (
              <PostCard key={post.id} post={post} headingLevel="h3" />
            ))}
          </Stack>
        )}
        <Link asChild color="brand.link" mt="4" display="inline-flex" alignItems="center" gap="1">
          <NextLink href="/blog">
            Ver todos los posts <ChevronRightIcon />
          </NextLink>
        </Link>
      </Box>

      <Box as="section" aria-labelledby="en-la-web">
        <SectionHeading id="en-la-web">Yo en la web</SectionHeading>
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
