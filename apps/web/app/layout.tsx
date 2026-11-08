import { Box, Container, Link, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import { Provider } from '@/components/provider';

export const metadata: Metadata = {
  title: { default: 'huitzi.xyz', template: '%s · huitzi.xyz' },
  description: 'Blog técnico sobre orquestación de agentes de IA.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Provider>
          <Box as="header" borderBottomWidth="1px">
            <Container maxW="3xl" py="4">
              <Link asChild fontWeight="semibold" fontSize="lg">
                <NextLink href="/">huitzi.xyz</NextLink>
              </Link>
            </Container>
          </Box>
          <Container as="main" maxW="3xl" py="10">
            {children}
          </Container>
          <Box as="footer" borderTopWidth="1px">
            <Container maxW="3xl" py="6">
              <Text color="fg.muted" fontSize="sm">
                Huitzitzili Domingo
              </Text>
            </Container>
          </Box>
        </Provider>
      </body>
    </html>
  );
}
