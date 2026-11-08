'use client';

import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import { EmotionRegistry } from './emotion-registry';
import { system } from './theme/system';

/** Chakra v3 necesita un provider de cliente, con el sistema de la marca. */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <EmotionRegistry>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </EmotionRegistry>
  );
}
