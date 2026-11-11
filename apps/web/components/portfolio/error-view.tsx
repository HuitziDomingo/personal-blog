'use client';

import { Button, Heading, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

import type { SiteContent } from '@/lib/content/types';

/**
 * La API no respondió (429, 5xx o red) al generar una página por primera vez.
 * No es un 404: la página existe y puede volver a intentarse. reset() solo
 * re-renderiza en el cliente; router.refresh() vuelve a pedirla al servidor.
 */
export function ErrorView({ text, reset }: { text: SiteContent['ui']['error']; reset: () => void }) {
  const router = useRouter();

  return (
    <Stack gap="4" maxW="3xl" mx="auto">
      <Heading as="h1" size="2xl">
        {text.title}
      </Heading>
      <Text>{text.body}</Text>
      <Button
        alignSelf="start"
        onClick={() => {
          startTransition(() => {
            router.refresh();
            reset();
          });
        }}
      >
        {text.retry}
      </Button>
    </Stack>
  );
}
