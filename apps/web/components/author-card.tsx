import { Badge, Flex, Stack, Text } from '@chakra-ui/react';
import Image from 'next/image';

import yo from '@/assets/img/yo.webp';
import { glassTeal, palette } from '@/lib/brand';
import { es } from '@/lib/content/es';
import { profile } from '@/lib/site';

/** Tarjeta de autor al final de cada post (footer-blog-bio.js). */
export function AuthorCard() {
  return (
    <Flex as="aside" aria-label="Autor" gap="4" align="center" borderWidth="1px" borderRadius="xl" p="4" bg="brand.surface">
      <Image src={yo} alt="" width={56} height={56} style={{ borderRadius: '9999px' }} />
      <Stack gap="1">
        <Text fontWeight="bold">
          {profile.name}{' '}
          <Badge ms="1" bg={glassTeal} color={palette.light.fg} textTransform="none">
            {es.profile.authorBadge}
          </Badge>
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {es.profile.authorRole}
        </Text>
      </Stack>
    </Flex>
  );
}
