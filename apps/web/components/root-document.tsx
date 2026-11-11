import { Container } from '@chakra-ui/react';
import type { Metadata, Viewport } from 'next';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import type { ReactNode } from 'react';

import { palette } from '@/lib/brand';
import { colorModeScript } from '@/lib/color-mode';
import { siteUrl } from '@/lib/config';
import type { SiteContent } from '@/lib/content';
import { RSS_ALTERNATE } from '@/lib/seo';
import { profile } from '@/lib/site';

import { Provider } from './provider';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SkipLink } from './skip-link';

// Fuente de títulos de la marca; next/font la descarga en el build y la sirve
// desde el propio sitio, así que la CSP no necesita fonts.googleapis.com.
// Google la parte en ~120 rangos Unicode (japonés) y next/font no distingue el
// latino: con preload precargaría todos (~1,7 MB). Sin preload, el navegador
// baja solo los rangos de los caracteres que la página usa.
const headingFont = M_PLUS_Rounded_1c({
  weight: ['700', '800'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-heading',
});

/** Metadata común de los dos layouts raíz, con la descripción de su idioma. */
export function rootMetadata(content: SiteContent): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: profile.shortName, template: `%s · ${profile.shortName}` },
    description: content.siteDescription,
    applicationName: profile.shortName,
    authors: [{ name: profile.name }],
    creator: profile.name,
    alternates: { types: RSS_ALTERNATE },
  };
}

export const rootViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palette.light.bg },
    { media: '(prefers-color-scheme: dark)', color: palette.dark.bg },
  ],
};

/**
 * `<html>` y `<body>` de un idioma. Hay un layout raíz por idioma (ADR-024,
 * punto 2) para que cada página entregue su `lang` desde el servidor.
 */
export function RootDocument({ content, children }: { content: SiteContent; children: ReactNode }) {
  return (
    // El script de <head> añade la clase light/dark antes de hidratar.
    <html lang={content.htmlLang} className={headingFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
      </head>
      <body>
        <Provider>
          <SkipLink label={content.ui.skipLink} />
          <SiteHeader locale={content.locale} ui={content.ui} />
          <Container
            as="main"
            id="contenido"
            tabIndex={-1}
            maxW="4xl"
            w="full"
            flex="1"
            px={{ base: '4', md: '6' }}
            pt={{ base: '8', md: '12' }}
            _focus={{ outline: 'none' }}
          >
            {children}
          </Container>
          <SiteFooter ui={content.ui.footer} />
        </Provider>
      </body>
    </html>
  );
}
