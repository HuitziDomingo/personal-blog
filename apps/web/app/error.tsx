'use client';

import { Button, Heading, Stack, Text } from '@chakra-ui/react';

/**
 * La API no respondió (429, 5xx o red) al generar una página por primera vez.
 * No es un 404: la página existe y puede volver a intentarse.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Stack gap="4">
      <Heading as="h1" size="2xl">
        No pudimos cargar esta página
      </Heading>
      <Text>Inténtalo de nuevo en unos segundos.</Text>
      <Button alignSelf="start" onClick={reset}>
        Reintentar
      </Button>
    </Stack>
  );
}
