'use client';

import { IconButton, Menu, Portal } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

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

  const current = OPTIONS.find((option) => option.value === preference);
  const CurrentIcon = current?.icon ?? MonitorIcon;

  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }}>
      <Menu.Trigger asChild>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={current ? `${labels.current}: ${labels[current.value]}. ${labels.change}` : labels.change}
        >
          <CurrentIcon />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="10rem">
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
