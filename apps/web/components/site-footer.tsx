import { Box, Container, Flex, HStack, Link, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import type { SiteContent } from '@/lib/content/types';
import { profile, socialLinks } from '@/lib/site';

import { SocialIcon } from './brand-icons';
import { ExternalLink } from './external-link';
import { RssIcon } from './icons';

export function SiteFooter({ ui }: { ui: SiteContent['ui']['footer'] }) {
  return (
    <Box as="footer" borderTopWidth="1px" mt="16">
      <Container maxW="4xl" px={{ base: '4', md: '6' }} py="8">
        <Stack gap="4">
          <HStack as="ul" listStyleType="none" gap="4" wrap="wrap" fontSize="sm" aria-label={ui.social}>
            {socialLinks.map((link) => (
              <li key={link.network}>
                <ExternalLink href={link.href} display="inline-flex" alignItems="center" gap="1.5">
                  <SocialIcon network={link.network} />
                  {link.network}
                </ExternalLink>
              </li>
            ))}
          </HStack>
          <Link asChild color="brand.link" fontSize="sm" w="fit-content">
            <NextLink href="/feed.xml">
              <RssIcon style={{ display: 'inline', marginInlineEnd: '0.25em' }} />
              {ui.rss}
            </NextLink>
          </Link>
          <Flex justify="space-between" wrap="wrap" gap="2">
            <Text color="fg.muted" fontSize="sm">
              © {new Date().getFullYear()} {profile.name}
            </Text>
          </Flex>
        </Stack>
      </Container>
    </Box>
  );
}
