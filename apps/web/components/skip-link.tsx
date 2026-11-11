import { Link } from '@chakra-ui/react';

/** Primer elemento enfocable: salta la navegación (WCAG 2.4.1). */
export function SkipLink({ label }: { label: string }) {
  return (
    <Link
      href="#contenido"
      position="fixed"
      top="2"
      left="2"
      zIndex="skipLink"
      px="4"
      py="2"
      borderRadius="md"
      bg="fg"
      color="bg"
      fontWeight="semibold"
      transform="translateY(-200%)"
      _focusVisible={{ transform: 'translateY(0)' }}
    >
      {label}
    </Link>
  );
}
