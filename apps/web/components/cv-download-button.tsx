import { Link } from '@chakra-ui/react';

import { DownloadIcon } from './icons';

/**
 * «Descargar CV» (BLOG-152): botón relleno con el acento, con un brillo que
 * cruza una vez al cargar y otra en hover o foco (`.cv-cta` del tema). Lleva
 * al mismo PDF vigente que el botón de /cv; sin PDF no se muestra.
 */
export function CvDownloadButton({ href, label, block = false }: { href: string; label: string; block?: boolean }) {
  return (
    <Link
      href={href}
      className="cv-cta"
      display={block ? 'flex' : 'inline-flex'}
      alignItems="center"
      justifyContent="center"
      gap="2"
      minH="10"
      px="4"
      borderRadius="md"
      fontWeight="semibold"
      fontSize="sm"
      whiteSpace="nowrap"
      bg="brand.accent"
      color="brand.onAccent"
      textDecoration="none"
      _hover={{ textDecoration: 'none', bg: 'brand.accent', color: 'brand.onAccent' }}
    >
      <DownloadIcon />
      {label}
    </Link>
  );
}
