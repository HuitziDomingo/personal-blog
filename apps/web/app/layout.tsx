import { Container } from '@chakra-ui/react';
import type { Metadata, Viewport } from 'next';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import type { ReactNode } from 'react';

import { Provider } from '@/components/provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { palette } from '@/lib/brand';
import { colorModeScript } from '@/lib/color-mode';
import { siteUrl } from '@/lib/config';
import { profile, siteDescription } from '@/lib/site';

// Fuente de títulos de la marca; next/font la descarga en el build y la sirve
// desde el propio sitio, así que la CSP no necesita fonts.googleapis.com.
const headingFont = M_PLUS_Rounded_1c({
  weight: ['700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: profile.shortName, template: `%s · ${profile.shortName}` },
  description: siteDescription,
  applicationName: profile.shortName,
  authors: [{ name: profile.name }],
  creator: profile.name,
  alternates: { types: { 'application/rss+xml': [{ url: '/feed.xml', title: `Blog de ${profile.shortName}` }] } },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palette.light.bg },
    { media: '(prefers-color-scheme: dark)', color: palette.dark.bg },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // El script de <head> añade la clase light/dark antes de hidratar.
    <html lang="es" className={headingFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
      </head>
      <body>
        <Provider>
          <SkipLink />
          <SiteHeader />
          <Container
            as="main"
            id="contenido"
            tabIndex={-1}
            maxW="4xl"
            px={{ base: '4', md: '6' }}
            pt={{ base: '8', md: '12' }}
            _focus={{ outline: 'none' }}
          >
            {children}
          </Container>
          <SiteFooter />
        </Provider>
      </body>
    </html>
  );
}
