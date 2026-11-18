import { ChakraProvider } from '@chakra-ui/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { en } from '@/lib/content/en';
import { es } from '@/lib/content/es';

import { system } from '../theme/system';
import { IslandCredit } from './island-credit';

describe('IslandCredit', () => {
  it.each([es, en])('enlaza a Quaternius, CC0 y Poly Pizza ($locale)', (content) => {
    const html = renderToStaticMarkup(
      <ChakraProvider value={system}>
        <IslandCredit text={content.ui.home.island.credit} />
      </ChakraProvider>,
    );

    expect(html).toContain('href="https://quaternius.com/"');
    expect(html).toContain('href="https://creativecommons.org/publicdomain/zero/1.0/"');
    expect(html).toContain('href="https://poly.pizza/u/Quaternius"');
    expect(html).not.toMatch(/\{\w+\}/);
  });
});
