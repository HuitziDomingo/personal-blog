import { Badge, Box, Flex, HStack, Stack, Text } from '@chakra-ui/react';

import type { PublicComment } from '@/lib/api';
import { commentThreads } from '@/lib/comments';
import { formatDate } from '@/lib/format';

import { Avatar } from './comment-avatar';
import { BubbleIcon } from './comment-icons';
import { CommentText } from './comment-text';
import { ReplyButton } from './comments-client';

/**
 * Los comentarios aprobados, renderizados en el servidor con el ISR del post
 * (ADR-022, punto 6). Un solo nivel de respuestas, y las del autor con la marca
 * «Autor» (punto 7).
 */
export function CommentList({ comments }: { comments: readonly PublicComment[] }) {
  const threads = commentThreads(comments);

  if (threads.length === 0) {
    return <EmptyComments />;
  }

  return (
    <Stack as="ol" listStyleType="none" gap="5" m="0" p="0">
      {threads.map(({ comment, replies }) => (
        <Stack as="li" key={comment.id} gap="3.5">
          <CommentItem comment={comment} canReply />
          {replies.map((reply) => (
            <Box key={reply.id} ms={{ base: '6', md: '14' }}>
              <CommentItem comment={reply} nested />
            </Box>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function CommentItem({ comment, canReply = false, nested = false }: { comment: PublicComment; canReply?: boolean; nested?: boolean }) {
  const date = formatDate(comment.createdAt);

  return (
    <Flex
      as="article"
      gap={{ base: '3', md: '3.5' }}
      {...(nested ? { p: { base: '3', md: '3.5' }, borderRadius: 'xl', borderWidth: '1px', bg: 'brand.surface' } : {})}
    >
      <Avatar name={comment.name} author={comment.byAuthor} size={nested ? '9' : '10'} />
      <Stack gap="1.5" flex="1" minW="0">
        <HStack gap="2.5" wrap="wrap" align="center">
          <Text as="strong" fontWeight="bold">
            {comment.name}
          </Text>
          {comment.byAuthor && (
            <Badge variant="outline" color="brand.accent" borderColor="brand.accent" textTransform="none" fontWeight="semibold">
              Autor
            </Badge>
          )}
          {date && (
            <Text asChild fontSize="sm" color="fg.muted">
              <time dateTime={comment.createdAt}>{date}</time>
            </Text>
          )}
        </HStack>
        <CommentText content={comment.content} />
        {canReply && <ReplyButton id={comment.id} name={comment.name} />}
      </Stack>
    </Flex>
  );
}

function EmptyComments() {
  return (
    <Flex gap="4" align="center" p="6" borderRadius="xl" borderWidth="1px" bg="brand.surface">
      <Box as="span" color="brand.accent" fontSize="3xl" flexShrink={0}>
        <BubbleIcon />
      </Box>
      <Stack gap="1">
        <Text fontFamily="heading" fontWeight="bold" fontSize="lg">
          Sé la primera persona en comentar
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Preguntas, correcciones y temas para el siguiente post son bienvenidos.
        </Text>
      </Stack>
    </Flex>
  );
}
