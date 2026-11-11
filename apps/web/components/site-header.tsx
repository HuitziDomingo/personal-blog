'use client';

import { Box, Container, HStack, IconButton, Link } from '@chakra-ui/react';
import Image from 'next/image';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import logo from '@/assets/img/logo.png';
import { alternateHref, localizedPath } from '@/lib/content/routes';
import type { Locale, SiteContent } from '@/lib/content/types';
import { profile } from '@/lib/site';

import { ColorModeToggle } from './color-mode-toggle';
import { MenuIcon } from './icons';

interface NavItem {
  href: string;
  label: string;
  /** Aviso de idioma junto al link, cuando la página no existe en el idioma actual. */
  note?: string;
}

function navItems(locale: Locale, ui: SiteContent['ui']): NavItem[] {
  return [
    { href: localizedPath(locale, '/works'), label: ui.nav.works },
    // El blog solo existe en español (ADR-024, punto 1).
    { href: '/blog', label: ui.nav.blog, ...(ui.blogLanguageNote ? { note: ui.blogLanguageNote } : {}) },
  ];
}

/** Texto del link, con el aviso de idioma en `lang="es"` si lo hay. */
function NavLabel({ item }: { item: NavItem }) {
  return (
    <>
      {item.label}
      {item.note && (
        <Box as="span" lang="es" fontSize="xs" color="fg.muted" ms="1">
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

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ locale, ui }: { locale: Locale; ui: SiteContent['ui'] }) {
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
      backdropFilter="saturate(180%) blur(10px)"
      borderBottomWidth="1px"
    >
      <Container maxW="4xl" px={{ base: '4', md: '6' }} h="16" display="flex" alignItems="center" gap="3">
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
            <Image
              src={logo}
              alt=""
              width={28}
              height={28}
              priority
              style={{ transition: 'transform 0.2s ease' }}
            />
            <span aria-hidden="true">{`< ${profile.shortName}/ >`}</span>
          </NextLink>
        </Link>

        <Box as="nav" aria-label={ui.primaryNav} ml="auto">
          <HStack as="ul" listStyleType="none" gap="1" display={{ base: 'none', md: 'flex' }}>
            {nav.map((item) => {
              const { href } = item;
              const active = isActive(pathname, href);

              return (
                <li key={href}>
                  <Link
                    asChild
                    px="3"
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

          <Box display={{ base: 'block', md: 'none' }}>
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
              {[{ href: home, label: ui.nav.home } as NavItem, ...nav].map((item) => {
                const { href } = item;
                const active = href === home ? pathname === home : isActive(pathname, href);

                return (
                  <li key={href}>
                    <Link
                      asChild
                      display="block"
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

        <LanguageSwitch locale={locale} ui={ui} />
        <ColorModeToggle labels={ui.colorMode} />
      </Container>
    </Box>
  );
}
