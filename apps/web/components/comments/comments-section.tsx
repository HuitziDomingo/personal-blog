import { Heading, HStack, Stack, Text } from '@chakra-ui/react';

import type { PublicCommentPage } from '@/lib/api';

import { CommentList } from './comment-list';
import { CommentsClient } from './comments-client';

/**
 * Sección de comentarios al final de un post (ADR-022). `comments` es null si
 * la API no respondió: el formulario sigue disponible y la lista dice que no
 * se pudo cargar, sin tirar la página del post.
 */
export function CommentsSection({
  slug,
  apiBaseUrl,
  comments,
}: {
  slug: string;
  apiBaseUrl: string;
  comments: PublicCommentPage | null;
}) {
  return (
    <Stack as="section" aria-labelledby="titulo-comentarios" gap="6" mt="12" pt="8" borderTopWidth="1px">
      <HStack justify="space-between" align="baseline" gap="4" wrap="wrap">
        <Heading as="h2" id="titulo-comentarios" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="800">
          Comentarios{' '}
          {comments && (
            <Text as="span" color="fg.muted" fontWeight="bold">
              ({comments.total})
            </Text>
          )}
        </Heading>
        <Text fontSize="sm" color="fg.muted">
          Moderados antes de publicarse
        </Text>
      </HStack>

      <CommentsClient apiBaseUrl={apiBaseUrl} slug={slug}>
        {comments ? (
          <CommentList comments={comments.items} />
        ) : (
          <Text color="fg.muted">No pudimos cargar los comentarios. Vuelve a intentarlo en unos minutos.</Text>
        )}
      </CommentsClient>
    </Stack>
  );
}
