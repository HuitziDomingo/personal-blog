import { Heading, Link, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

export default function NotFound() {
  return (
    <Stack gap="4">
      <Heading as="h1" size="2xl">
        No encontramos esa página
      </Heading>
      <Text>
        <Link asChild>
          <NextLink href="/">Volver a los posts</NextLink>
        </Link>
      </Text>
    </Stack>
  );
}
