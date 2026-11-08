import { Badge, HStack } from '@chakra-ui/react';

export function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <HStack as="ul" listStyleType="none" gap="2" wrap="wrap" aria-label="Etiquetas">
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant="subtle" bg="bg.muted" color="fg" textTransform="none">
            {tag}
          </Badge>
        </li>
      ))}
    </HStack>
  );
}
