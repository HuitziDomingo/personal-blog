'use client';

import { Box, Container, HStack, IconButton, Link } from '@chakra-ui/react';
import Image from 'next/image';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import logo from '@/assets/img/logo.png';
import { profile } from '@/lib/site';

import { ColorModeToggle } from './color-mode-toggle';
import { MenuIcon } from './icons';

const NAV = [
  { href: '/works', label: 'Trabajos' },
  { href: '/blog', label: 'Blog' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
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
          fontSize={{ base: 'md', sm: 'lg' }}
          color="fg"
          textDecoration="none"
          _hover={{ textDecoration: 'none', '& img': { transform: 'rotate(20deg)' } }}
        >
          <NextLink href="/" aria-label={`${profile.shortName}, inicio`}>
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

        <Box as="nav" aria-label="Principal" ml="auto">
          <HStack as="ul" listStyleType="none" gap="1" display={{ base: 'none', md: 'flex' }}>
            {NAV.map(({ href, label }) => {
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
                      {label}
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
              aria-label="Menú de navegación"
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
              {[{ href: '/', label: 'Inicio' }, ...NAV].map(({ href, label }) => {
                const active = href === '/' ? pathname === '/' : isActive(pathname, href);

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
                        {label}
                      </NextLink>
                    </Link>
                  </li>
                );
              })}
            </Box>
          </Box>
        </Box>

        <ColorModeToggle />
      </Container>
    </Box>
  );
}
