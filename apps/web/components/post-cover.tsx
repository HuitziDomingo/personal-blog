import { Box, Text } from '@chakra-ui/react';
import Image from 'next/image';

import { AI_COVER_CAPTION, type Cover } from '@/lib/cover';

/** Tamaño fijo de las portadas (ADR-026, punto 8). */
const COVER_WIDTH = 1024;
const COVER_HEIGHT = 576;

/**
 * La portada de un post, servida con next/image desde /_next/image: la CSP no
 * cambia (ADR-026, punto 9). Si la generó una IA, lleva la leyenda (punto 6).
 */
export function PostCover({ cover }: { cover: Cover }) {
  return (
    <Box as="figure" m="0">
      <Box borderRadius="xl" overflow="hidden" bg="brand.surface" borderWidth="1px">
        <Image
          src={cover.url}
          alt={cover.alt}
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
          sizes="(min-width: 768px) 70ch, calc(100vw - 2rem)"
          // Arriba del contenido: suele ser el elemento del LCP del post.
          preload
          fetchPriority="high"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </Box>
      {cover.aiGenerated && (
        <Text as="figcaption" mt="2" fontSize="sm" color="fg.muted">
          {AI_COVER_CAPTION}
        </Text>
      )}
    </Box>
  );
}
