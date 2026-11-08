import { Box } from '@chakra-ui/react';

/**
 * Tipografía de lectura para el HTML de un post, ya sanitizado en el servidor
 * con packages/markdown (ADR-017, punto 5). Los estilos van por selector
 * porque el HTML no lleva clases: la allowlist no permite `class`.
 */
export function PostBody({ html }: { html: string }) {
  return (
    <Box
      fontSize={{ base: '1.0625rem', md: '1.125rem' }}
      lineHeight="1.8"
      css={{
        overflowWrap: 'break-word',
        '& > * + *': { marginTop: '1.25em' },
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          fontFamily: 'heading',
          fontWeight: '800',
          lineHeight: '1.3',
          marginTop: '2em',
          scrollMarginTop: '5rem',
        },
        '& h1': { fontSize: '1.875em' },
        '& h2': { fontSize: '1.5em' },
        '& h3': { fontSize: '1.25em' },
        '& h4, & h5, & h6': { fontSize: '1.05em' },
        '& h2 + *, & h3 + *, & h4 + *': { marginTop: '0.75em' },
        '& a': {
          color: 'brand.link',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          textDecorationThickness: '1px',
          _hover: { textDecorationThickness: '2px' },
        },
        '& strong': { fontWeight: '700' },
        '& ul, & ol': { paddingInlineStart: '1.5em' },
        '& ul': { listStyleType: 'disc' },
        '& ol': { listStyleType: 'decimal' },
        '& li + li': { marginTop: '0.4em' },
        '& li::marker': { color: 'brand.accent' },
        '& blockquote': {
          borderInlineStartWidth: '4px',
          borderColor: 'brand.accent',
          bg: 'brand.surface',
          borderRadius: '0 0.5rem 0.5rem 0',
          paddingBlock: '0.75em',
          paddingInline: '1.25em',
          color: 'fg.muted',
          fontStyle: 'italic',
        },
        '& blockquote > * + *': { marginTop: '0.75em' },
        '& code': {
          fontFamily: 'mono',
          fontSize: '0.875em',
          bg: 'brand.code',
          borderRadius: 'sm',
          paddingInline: '0.35em',
          paddingBlock: '0.1em',
        },
        '& pre': {
          bg: 'brand.code',
          borderWidth: '1px',
          borderRadius: 'lg',
          padding: '1em 1.25em',
          overflowX: 'auto',
          fontSize: '0.875em',
          lineHeight: '1.65',
          tabSize: '2',
        },
        '& pre code': { bg: 'transparent', padding: '0', fontSize: 'inherit', borderRadius: '0' },
        '& img': {
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
          marginInline: 'auto',
          borderRadius: 'lg',
          borderWidth: '1px',
        },
        '& hr': { borderColor: 'border', marginBlock: '2.5em' },
        '& table': {
          display: 'block',
          maxWidth: '100%',
          overflowX: 'auto',
          borderCollapse: 'collapse',
          fontSize: '0.9375em',
          lineHeight: '1.6',
        },
        '& th, & td': {
          borderWidth: '1px',
          paddingBlock: '0.5em',
          paddingInline: '0.75em',
          textAlign: 'start',
          verticalAlign: 'top',
        },
        '& th': { bg: 'brand.surface', fontWeight: '700' },
        '& tbody tr:nth-of-type(even)': { bg: 'brand.surface' },
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
