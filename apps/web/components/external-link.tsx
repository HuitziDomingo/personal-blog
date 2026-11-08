import { Link, type LinkProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import { ExternalLinkIcon } from './icons';

/** Link a otro sitio: abre en otra pestaña, sin `opener` y lo anuncia. */
export function ExternalLink({ href, children, ...props }: LinkProps & { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" color="brand.link" {...props}>
      {children}
      <ExternalLinkIcon style={{ display: 'inline', marginInlineStart: '0.25em' }} />
      <span className="sr-only"> (abre en otra pestaña)</span>
    </Link>
  );
}
