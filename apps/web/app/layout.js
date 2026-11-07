// @ts-check
import { Box, Container, Link, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { Provider } from '@/components/provider';

/** @type {import('next').Metadata} */
export const metadata = {
  title: { default: 'huitzi.xyz', template: '%s · huitzi.xyz' },
  description: 'Blog técnico sobre orquestación de agentes de IA.',
};

/** @param {{ children: import('react').ReactNode }} props */
export default function RootLayout({ children }) {
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
