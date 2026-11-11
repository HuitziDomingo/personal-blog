import { Box, Heading, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import Image from 'next/image';

import youtube from '@/assets/img/works/youtube.webp';
import { ExternalLinkIcon } from '@/components/icons';
import { PostCard } from '@/components/post-card';
import { SectionHeading } from '@/components/section-heading';
import { postsApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { featuredVideo, siteDescription } from '@/lib/site';

// ISR (ADR-017): Next exige un literal; debe coincidir con REVALIDATE_SECONDS.
export const revalidate = 60;

export const metadata = pageMetadata({ title: 'Blog', description: siteDescription, path: '/blog' });

export default async function BlogPage() {
  const page = await postsApi.listPublished();

  return (
    <Stack gap="12" maxW="3xl" mx="auto">
      <Stack gap="3">
        <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800">
          Blog
        </Heading>
        <Text color="fg.muted">{siteDescription}</Text>
      </Stack>

      {page.items.length === 0 ? (
        <Text color="fg.muted">Todavía no hay posts publicados.</Text>
      ) : (
        <Stack as="ul" listStyleType="none" gap="5">
          {page.items.map((post, index) => (
            <li key={post.id}>
              <PostCard post={post} index={index} />
            </li>
          ))}
        </Stack>
      )}

      <Box as="section" aria-labelledby="en-video">
        <SectionHeading id="en-video">{featuredVideo.heading}</SectionHeading>
        <LinkBox
          as="article"
          display="flex"
          flexDirection={{ base: 'column', sm: 'row' }}
          gap="4"
          alignItems={{ sm: 'center' }}
          borderWidth="1px"
          borderRadius="xl"
          overflow="hidden"
          bg="brand.surface"
          _hover={{ borderColor: 'brand.accent' }}
        >
          <Box flexShrink={0} w={{ base: 'full', sm: '56' }}>
            <Image
              src={youtube}
              alt=""
              placeholder="blur"
              sizes="(min-width: 480px) 224px, 100vw"
              style={{ width: '100%', height: 'auto' }}
            />
          </Box>
          <Box p={{ base: '4', sm: '0' }} pe={{ sm: '4' }}>
            <Heading as="h3" fontSize="lg">
              <LinkOverlay href={featuredVideo.href} target="_blank" rel="noopener noreferrer">
                {featuredVideo.title}
                <ExternalLinkIcon style={{ display: 'inline', marginInlineStart: '0.35em' }} />
                <span className="sr-only"> (abre en otra pestaña)</span>
              </LinkOverlay>
            </Heading>
          </Box>
        </LinkBox>
      </Box>
    </Stack>
  );
}
