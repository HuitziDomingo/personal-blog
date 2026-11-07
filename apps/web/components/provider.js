// @ts-check
'use client';

import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

import { EmotionRegistry } from './emotion-registry';

/**
 * Chakra v3 necesita un provider de cliente. En el spike va con el sistema por
 * defecto y sin modo oscuro (next-themes): el tema propio es parte del ADR.
 * @param {{ children: import('react').ReactNode }} props
 */
export function Provider({ children }) {
  return (
    <EmotionRegistry>
      <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>
    </EmotionRegistry>
  );
}
