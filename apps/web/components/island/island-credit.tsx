import { Text } from '@chakra-ui/react';
import { Fragment } from 'react';

import { ExternalLink } from '@/components/external-link';
import { islandCreditLinks } from '@/lib/site';

type CreditMark = keyof typeof islandCreditLinks;

function isCreditMark(value: string): value is CreditMark {
  return Object.hasOwn(islandCreditLinks, value);
}

/** Crédito de la isla (Quaternius, CC0): el texto de lib/content con sus links. */
export function IslandCredit({ text }: { text: string }) {
  // Con un grupo de captura, split deja las marcas en las posiciones impares.
  const parts = text.split(/\{(\w+)\}/);

  return (
    <Text fontSize="xs" color="fg.muted" textAlign="center" mt="2">
      {parts.map((part, index) => {
        if (index % 2 === 1 && isCreditMark(part)) {
          const link = islandCreditLinks[part];
          return (
            <ExternalLink key={part} href={link.href}>
              {link.label}
            </ExternalLink>
          );
        }
        return <Fragment key={`${String(index)}-text`}>{part}</Fragment>;
      })}
    </Text>
  );
}
