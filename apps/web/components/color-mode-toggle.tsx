'use client';

import { IconButton, Menu, Portal } from '@chakra-ui/react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

import { COLOR_MODE_KEY, type ColorModePreference, readPreference, resolveMode } from '@/lib/color-mode';

import type { SiteContent } from '@/lib/content/types';

import { MonitorIcon, MoonIcon, SunIcon } from './icons';

type Labels = SiteContent['ui']['colorMode'];

const OPTIONS: { value: ColorModePreference; icon: typeof SunIcon }[] = [
  { value: 'light', icon: SunIcon },
  { value: 'dark', icon: MoonIcon },
  { value: 'system', icon: MonitorIcon },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Dispositivos con mouse o trackpad: ahí el menú también se abre al pasar el cursor. */
export const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/** Retardo al cerrar tras salir con el cursor: da tiempo de llegar al menú sin que parpadee. */
export const HOVER_CLOSE_DELAY_MS = 150;

function apply(preference: ColorModePreference): void {
  const mode = resolveMode(preference, window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  root.style.colorScheme = mode;
}

/**
 * Claro, oscuro o sistema. El modo inicial lo aplica el script de <head>
 * (lib/color-mode.ts); este menú solo lo cambia y, en «Sistema», sigue los
 * cambios del sistema operativo.
 *
 * Apertura (BLOG-152): en todos los dispositivos, con click o tap, Enter y
 * Espacio; Escape cierra y devuelve el foco al botón (todo eso, con
 * aria-expanded y aria-controls, lo da el Menu de Chakra/Ark). Con mouse en un
 * dispositivo `HOVER_QUERY` también se abre al pasar el cursor y se cierra
 * `HOVER_CLOSE_DELAY_MS` después de salir del botón y del menú. Un click
 * mientras está abierto por hover lo deja abierto. Con el dedo, solo tap.
 */
export function ColorModeToggle({ labels }: { labels: Labels }) {
  // null hasta montar: el servidor no conoce la preferencia, y así el HTML
  // del servidor y el primer render del cliente coinciden.
  const [preference, setPreference] = useState<ColorModePreference | null>(null);

  useEffect(() => {
    setPreference(readPreference(window.localStorage));
  }, []);

  useEffect(() => {
    if (preference !== 'system') {
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      apply('system');
    };
    query.addEventListener('change', onChange);

    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [preference]);

  function choose(next: ColorModePreference): void {
    try {
      if (next === 'system') {
        window.localStorage.removeItem(COLOR_MODE_KEY);
      } else {
        window.localStorage.setItem(COLOR_MODE_KEY, next);
      }
    } catch {
      // Sin almacenamiento (modo privado estricto): el cambio dura la visita.
    }
    apply(next);
    setPreference(next);
  }

  const [open, setOpen] = useState(false);
  // Abierto por hover (se cierra al salir) o por click/teclado (se queda).
  const openedByHover = useRef(false);
  // Click sobre el botón mientras estaba abierto por hover: no lo cierra.
  const pinning = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose(): void {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  useEffect(() => cancelClose, []);

  function canHover(event: ReactPointerEvent): boolean {
    return event.pointerType === 'mouse' && window.matchMedia(HOVER_QUERY).matches;
  }

  function onPointerEnter(event: ReactPointerEvent): void {
    if (!canHover(event)) {
      return;
    }
    cancelClose();
    if (!open) {
      openedByHover.current = true;
      setOpen(true);
    }
  }

  function onPointerLeave(event: ReactPointerEvent): void {
    if (!canHover(event) || !openedByHover.current) {
      return;
    }
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      openedByHover.current = false;
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }

  const current = OPTIONS.find((option) => option.value === preference);
  const CurrentIcon = current?.icon ?? MonitorIcon;

  return (
    <Menu.Root
      positioning={{ placement: 'bottom-end' }}
      open={open}
      onOpenChange={(details) => {
        cancelClose();
        if (!details.open && pinning.current) {
          // Click sobre un menú abierto por hover: pasa a abierto por click.
          pinning.current = false;
          openedByHover.current = false;
          return;
        }
        if (!details.open) {
          openedByHover.current = false;
        }
        setOpen(details.open);
      }}
    >
      <Menu.Trigger asChild>
        <IconButton
          variant="ghost"
          size="sm"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          // En captura: corre antes que el manejador del Menu, abra este con el
          // pointerdown o con el click. Se limpia después del click.
          onPointerDownCapture={() => {
            pinning.current = open && openedByHover.current;
          }}
          onClick={() => {
            setTimeout(() => {
              pinning.current = false;
            }, 0);
          }}
          aria-label={current ? `${labels.current}: ${labels[current.value]}. ${labels.change}` : labels.change}
        >
          <CurrentIcon />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="10rem" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
            <Menu.RadioItemGroup
              value={preference ?? 'system'}
              onValueChange={(details) => {
                choose(details.value as ColorModePreference);
              }}
            >
              <Menu.ItemGroupLabel>{labels.group}</Menu.ItemGroupLabel>
              {OPTIONS.map(({ value, icon: Icon }) => (
                <Menu.RadioItem key={value} value={value}>
                  <Icon />
                  {labels[value]}
                  <Menu.ItemIndicator />
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
