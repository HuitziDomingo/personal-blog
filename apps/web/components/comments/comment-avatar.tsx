import { Flex } from '@chakra-ui/react';

/** Inicial del nombre en un círculo. Decorativa: el nombre ya está al lado. */
export function Avatar({ name, author = false, size = '10' }: { name: string; author?: boolean; size?: string }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';

  return (
    <Flex
      aria-hidden="true"
      flexShrink={0}
      w={size}
      h={size}
      borderRadius="full"
      align="center"
      justify="center"
      fontWeight="bold"
      bg={author ? 'brand.accent' : 'brand.code'}
      color={author ? { _light: 'white', _dark: '#18181b' } : 'fg'}
    >
      {initial}
    </Flex>
  );
}
