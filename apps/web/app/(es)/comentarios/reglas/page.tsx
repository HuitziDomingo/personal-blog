import { Box, Heading, Link, List, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { ArrowLeftIcon } from '@/components/icons';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Reglas de los comentarios',
  description: 'Cómo se moderan los comentarios del blog y qué datos se guardan.',
  path: '/comentarios/reglas',
});

/** Reglas y privacidad de los comentarios (ADR-022, puntos 2, 3, 5 y 9). */
export default function CommentRulesPage() {
  return (
    <Box as="article" maxW="70ch" mx="auto">
      <Stack gap="8">
        <Link asChild color="brand.link" fontSize="sm" display="inline-flex" alignItems="center" gap="1" w="fit-content">
          <NextLink href="/blog">
            <ArrowLeftIcon /> Blog
          </NextLink>
        </Link>
        <Heading as="h1" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="800" lineHeight="1.2">
          Reglas de los comentarios
        </Heading>

        <Section title="Cómo se moderan">
          <Text>
            Ningún comentario se publica solo. Primero lo clasifica un modelo de IA (Gemini, de Google) para separar el spam y el
            abuso, y después lo leo yo. El modelo solo sugiere: la decisión de publicarlo o no es mía.
          </Text>
        </Section>

        <Section title="Qué se publica">
          <List.Root ps="5" gap="2">
            <List.Item>Preguntas, correcciones y temas relacionados con el post.</List.Item>
            <List.Item>Solo texto. Lo que escribas entre backticks se muestra como `código en línea`.</List.Item>
            <List.Item>Los links no son clicables: una URL se muestra como texto.</List.Item>
            <List.Item>No se publica spam, publicidad, ataques personales ni datos personales de nadie.</List.Item>
          </List.Root>
        </Section>

        <Section title="Qué datos se guardan">
          <List.Root ps="5" gap="2">
            <List.Item>Tu nombre, tal como lo escribas, y tu comentario. No pedimos correo.</List.Item>
            <List.Item>No se guarda tu IP, tu navegador ni ningún identificador tuyo.</List.Item>
            <List.Item>
              El texto se envía a Google para la clasificación, en su plan gratuito, que puede usarlo para mejorar sus productos.
              Por eso, no incluyas datos personales.
            </List.Item>
            <List.Item>Los comentarios rechazados se borran a los 30 días.</List.Item>
          </List.Root>
        </Section>

        <Section title="Límites">
          <Text>
            Para frenar el spam, cada conexión puede enviar pocos comentarios seguidos. Si ves el aviso de «demasiados intentos»,
            espera unos minutos: tu texto sigue en el formulario.
          </Text>
        </Section>
      </Stack>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack as="section" gap="3">
      <Heading as="h2" fontSize="xl" fontWeight="bold">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}
