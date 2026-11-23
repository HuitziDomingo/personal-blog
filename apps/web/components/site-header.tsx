'use client';

import { Box, Container, HStack, IconButton, Link } from '@chakra-ui/react';
import Image, { type StaticImageData } from 'next/image';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import leon from '@/assets/img/leon.svg';
import { alternateHref, localizedPath } from '@/lib/content/routes';
import type { Locale, SiteContent } from '@/lib/content/types';
import { HEADER_GLASS } from '@/lib/glass';
import { profile } from '@/lib/site';

import { ColorModeToggle } from './color-mode-toggle';
import { CvDownloadButton } from './cv-download-button';
import { BriefcaseIcon, FileUserIcon, HomeIcon, MenuIcon, PenLineIcon } from './icons';

// next/image-types declara `*.svg` como `any` (por si se usa SVGR); aquí es
// un import estático de imagen, como los PNG.
const logo = leon as StaticImageData;

interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** Solo activo en su ruta exacta: el inicio, que es prefijo de todo. */
  exact?: boolean;
  /** Aviso de idioma junto al link, cuando la página no existe en el idioma actual. */
  note?: string;
}

export function navItems(locale: Locale, ui: SiteContent['ui']): NavItem[] {
  return [
    { href: localizedPath(locale, '/'), label: ui.nav.home, icon: HomeIcon, exact: true },
    { href: localizedPath(locale, '/works'), label: ui.nav.works, icon: BriefcaseIcon },
    { href: localizedPath(locale, '/cv'), label: ui.nav.cv, icon: FileUserIcon },
    // El blog solo existe en español (ADR-024, punto 1).
    { href: '/blog', label: ui.nav.blog, icon: PenLineIcon, ...(ui.blogLanguageNote ? { note: ui.blogLanguageNote } : {}) },
  ];
}

/**
 * Ícono y texto del link, con el aviso de idioma si lo hay (en el idioma de la
 * página). El ícono es decorativo: el texto siempre se ve.
 */
function NavLabel({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <>
      <Icon aria-hidden="true" style={{ flexShrink: 0, fontSize: '1.125em' }} />
      {item.label}
      {item.note && (
        <Box as="span" fontSize="xs" color="fg.muted" ms="1">
          ({item.note})
        </Box>
      )}
    </>
  );
}

/**
 * Link a la página equivalente en el otro idioma (ADR-024, puntos 4 y 7): un
 * link real con `hreflang` y su texto en el idioma de destino, de 44 px.
 */
function LanguageSwitch({ locale, ui }: { locale: Locale; ui: SiteContent['ui'] }) {
  const pathname = usePathname();
  const { label, hrefLang, lang } = ui.languageSwitch;

  return (
    <Link
      asChild
      minW="11"
      minH="11"
      px="2"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      borderRadius="md"
      fontSize="sm"
      fontWeight="semibold"
      color="fg"
      textDecoration="none"
      _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
    >
      <NextLink href={alternateHref(pathname, locale)} hrefLang={hrefLang} lang={lang}>
        {label}
      </NextLink>
    </Link>
  );
}

export function isActive(pathname: string, item: Pick<NavItem, 'href' | 'exact'>): boolean {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Cabecera fija. El nav completo, con «Descargar CV», va desde `lg`; debajo,
 * un menú desplegable con los mismos links y el botón destacado arriba.
 * `cvUrl` es el PDF vigente del idioma (el mismo del botón de /cv) o null.
 */
export function SiteHeader({ locale, ui, cvUrl }: { locale: Locale; ui: SiteContent['ui']; cvUrl: string | null }) {
  const pathname = usePathname();
  const nav = navItems(locale, ui);
  const home = localizedPath(locale, '/');
  // Menú móvil como disclosure: los links siguen dentro del <nav>.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="sticky"
      bg="brand.header"
      backdropFilter={`saturate(${String(HEADER_GLASS.saturate * 100)}%) blur(${String(HEADER_GLASS.blur)}px)`}
      borderBottomWidth="1px"
    >
      {/* Desde lg, más ancha que el contenido (4xl): cabe el nav con íconos, «Descargar CV», el idioma y el tema. */}
      <Container maxW={{ base: '4xl', lg: '5xl' }} px={{ base: '4', md: '6' }} h="16" display="flex" alignItems="center" gap="3">
        <Link
          asChild
          display="inline-flex"
          alignItems="center"
          gap="2"
          fontFamily="heading"
          fontWeight="800"
          // Sin salto de línea: en móvil comparte la fila con el menú, el
          // selector de idioma y el de tema.
          fontSize={{ base: 'sm', sm: 'lg' }}
          whiteSpace="nowrap"
          color="fg"
          textDecoration="none"
          _hover={{ textDecoration: 'none', '& img': { transform: 'rotate(20deg)' } }}
        >
          <NextLink href={home} aria-label={ui.homeLinkLabel}>
            {/* El león es decorativo: el link se nombra con su aria-label. */}
            <Image
              src={logo}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              priority
              style={{ flexShrink: 0, transition: 'transform 0.2s ease' }}
            />
            {/* Por debajo de 360 px solo la imagen: el texto no cabe junto al menú, el idioma y el tema. */}
            <Box as="span" aria-hidden="true" css={{ '@media (max-width: 359.98px)': { display: 'none' } }}>
              {`< ${profile.shortName}/ >`}
            </Box>
          </NextLink>
        </Link>

        <Box as="nav" aria-label={ui.primaryNav} ml="auto">
          <HStack as="ul" listStyleType="none" gap="0.5" display={{ base: 'none', lg: 'flex' }}>
            {nav.map((item) => {
              const { href } = item;
              const active = isActive(pathname, item);

              return (
                <li key={href}>
                  <Link
                    asChild
                    display="inline-flex"
                    alignItems="center"
                    gap="1.5"
                    whiteSpace="nowrap"
                    px="2.5"
                    py="2"
                    borderRadius="md"
                    fontWeight="medium"
                    color={active ? 'brand.accent' : 'fg'}
                    textDecoration={active ? 'underline' : 'none'}
                    textUnderlineOffset="6px"
                    textDecorationThickness="2px"
                    _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
                  >
                    <NextLink href={href} aria-current={active ? 'page' : undefined}>
                      <NavLabel item={item} />
                    </NextLink>
                  </Link>
                </li>
              );
            })}
          </HStack>

          <Box display={{ base: 'block', lg: 'none' }}>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={ui.menuLabel}
              aria-expanded={open}
              aria-controls="menu-movil"
              onClick={() => {
                setOpen((value) => !value);
              }}
            >
              <MenuIcon />
            </IconButton>
            <Box
              as="ul"
              id="menu-movil"
              hidden={!open}
              listStyleType="none"
              position="absolute"
              insetX="0"
              top="16"
              bg="bg"
              borderBottomWidth="1px"
              px="4"
              py="2"
              shadow="md"
            >
              {cvUrl && (
                <Box as="li" pt="2" pb="3">
                  <CvDownloadButton href={cvUrl} label={ui.cvButton} block />
                </Box>
              )}
              {nav.map((item) => {
                const { href } = item;
                const active = isActive(pathname, item);

                return (
                  <li key={href}>
                    <Link
                      asChild
                      display="flex"
                      alignItems="center"
                      gap="2"
                      py="3"
                      fontWeight="medium"
                      color={active ? 'brand.accent' : 'fg'}
                    >
                      <NextLink
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          setOpen(false);
                        }}
                      >
                        <NavLabel item={item} />
                      </NextLink>
                    </Link>
                  </li>
                );
              })}
            </Box>
          </Box>
        </Box>

        {cvUrl && (
          <Box display={{ base: 'none', lg: 'block' }} flexShrink={0}>
            <CvDownloadButton href={cvUrl} label={ui.cvButton} />
          </Box>
        )}
        <LanguageSwitch locale={locale} ui={ui} />
        <ColorModeToggle labels={ui.colorMode} />
      </Container>
    </Box>
  );
}
