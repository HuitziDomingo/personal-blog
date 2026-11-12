import { Code, Text } from '@chakra-ui/react';

import { commentSegments } from '@/lib/comments';

/**
 * El texto de un comentario: solo texto, con los backticks como código en
 * línea (ADR-022, punto 2). Nunca usa dangerouslySetInnerHTML: React escapa
 * cada segmento, y una URL queda como texto, sin link.
 */
export function CommentText({ content, muted = false }: { content: string; muted?: boolean }) {
  return (
    <Text fontSize="md" lineHeight="1.6" whiteSpace="pre-wrap" overflowWrap="anywhere" color={muted ? 'fg.muted' : 'fg'}>
      {commentSegments(content).map((segment, index) =>
        segment.kind === 'code' ? (
          <Code key={index} fontSize="0.875em" px="1.5" py="0.5" borderRadius="sm" bg="brand.code" color="fg">
            {segment.text}
          </Code>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </Text>
  );
}
