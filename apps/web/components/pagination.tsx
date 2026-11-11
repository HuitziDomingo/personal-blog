import { Box, HStack, Link } from '@chakra-ui/react';
import NextLink from 'next/link';

import { pageHref, paginationItems } from '@/lib/pagination';

import { ChevronRightIcon } from './icons';

/** Objetivo táctil de 44 × 44 px como mínimo (WCAG 2.5.5). */
const TARGET = { minW: '11', minH: '11' } as const;

const itemStyle = {
  ...TARGET,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1',
  px: '3',
  borderRadius: 'md',
  borderWidth: '1px',
  fontWeight: 'medium',
} as const;

/**
 * Navegación entre páginas de /blog: Anterior, los números (con huecos si son
 * muchas) y Siguiente, centrados. Son links normales: funcionan sin
 * JavaScript y cada página tiene su URL.
 */
export function Pagination({ current, total }: { current: number; total: number }) {
  if (total <= 1) {
    return null;
  }

  return (
    <Box as="nav" aria-label="Páginas del blog">
      <HStack as="ul" listStyleType="none" justify="center" wrap="wrap" gap="2">
        {current > 1 && (
          <li>
            <Link asChild {...itemStyle} color="brand.link" _hover={{ borderColor: 'brand.accent' }}>
              <NextLink href={pageHref(current - 1)} rel="prev">
                <ChevronRightIcon style={{ transform: 'scaleX(-1)' }} />
                Anterior
              </NextLink>
            </Link>
          </li>
        )}
        {paginationItems(current, total).map((item) =>
          item.type === 'gap' ? (
            <Box
              as="li"
              key={item.key}
              {...TARGET}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              color="fg.muted"
              aria-hidden="true"
            >
              …
            </Box>
          ) : (
            <li key={item.page}>
              {item.page === current ? (
                <Box
                  as="span"
                  {...itemStyle}
                  aria-current="page"
                  bg="brand.accent"
                  borderColor="brand.accent"
                  color="bg"
                >
                  <span className="sr-only">Página </span>
                  {item.page}
                </Box>
              ) : (
                <Link asChild {...itemStyle} color="brand.link" _hover={{ borderColor: 'brand.accent' }}>
                  <NextLink href={pageHref(item.page)}>
                    <span className="sr-only">Página </span>
                    {item.page}
                  </NextLink>
                </Link>
              )}
            </li>
          ),
        )}
        {current < total && (
          <li>
            <Link asChild {...itemStyle} color="brand.link" _hover={{ borderColor: 'brand.accent' }}>
              <NextLink href={pageHref(current + 1)} rel="next">
                Siguiente
                <ChevronRightIcon />
              </NextLink>
            </Link>
          </li>
        )}
      </HStack>
    </Box>
  );
}
