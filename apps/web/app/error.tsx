'use client';

import { Button, Heading, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

/**
 * La API no respondió (429, 5xx o red) al generar una página por primera vez.
 * No es un 404: la página existe y puede volver a intentarse. reset() solo
 * re-renderiza en el cliente; router.refresh() vuelve a pedirla al servidor.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  return (
    <Stack gap="4">
      <Heading as="h1" size="2xl">
        No pudimos cargar esta página
      </Heading>
      <Text>Inténtalo de nuevo en unos segundos.</Text>
      <Button
        alignSelf="start"
        onClick={() => {
          startTransition(() => {
            router.refresh();
            reset();
          });
        }}
      >
        Reintentar
      </Button>
    </Stack>
  );
}
