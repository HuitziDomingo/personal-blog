import { Button, Heading, Separator, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { glassTeal, palette } from '@/lib/brand';

/** 404 del sitio, en español (el idioma por defecto, ADR-024). */
export function NotFoundView() {
  return (
    <Stack gap="4" maxW="3xl" mx="auto">
      <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800">
        No encontrado
      </Heading>
      <Text>La página que has estado buscando no se encuentra disponible :C</Text>
      <Separator my="4" />
      <Button asChild alignSelf="start" bg={glassTeal} color={palette.light.fg} _hover={{ opacity: 0.9 }}>
        <NextLink href="/">Regresar al inicio</NextLink>
      </Button>
    </Stack>
  );
}
