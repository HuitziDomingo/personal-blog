import { Heading, type HeadingProps } from '@chakra-ui/react';

/** Título de sección subrayado, la variante `section-title` de la web anterior. */
export function SectionHeading(props: HeadingProps) {
  return (
    <Heading
      as="h2"
      fontSize="xl"
      fontWeight="800"
      textDecoration="underline"
      textUnderlineOffset="6px"
      textDecorationThickness="4px"
      textDecorationColor="brand.accent"
      mb="4"
      {...props}
    />
  );
}
