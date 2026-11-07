import { computed, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

import { injectMediaQuery } from '../browser/match-media';
import { Accent, isAccent, isThemeMode, THEME_STORAGE_KEYS, ThemeMode } from './theme';
import { THEME_STORAGE } from './theme-storage';

/**
 * Preferencias de apariencia: tema claro, oscuro o del sistema, y color de
 * acento. Se guardan en localStorage; si no se puede, valen solo para la
 * sesión actual y la app arranca con el tema del sistema.
 *
 * El script de index.html aplica lo mismo antes de que arranque Angular, para
 * que no haya parpadeo; este servicio toma el control después y sigue en vivo
 * los cambios del sistema operativo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(THEME_STORAGE);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly systemDark = injectMediaQuery('(prefers-color-scheme: dark)');

  private readonly _mode = signal<ThemeMode>(this.read(THEME_STORAGE_KEYS.mode, isThemeMode) ?? 'system');
  private readonly _accent = signal<Accent>(this.read(THEME_STORAGE_KEYS.accent, isAccent) ?? 'neutral');

  readonly mode = this._mode.asReadonly();
  readonly accent = this._accent.asReadonly();
  readonly isDark = computed(() => {
    const mode = this._mode();

    return mode === 'dark' || (mode === 'system' && this.systemDark());
  });

  constructor() {
    effect(() => {
      this.root.classList.toggle('dark', this.isDark());
      this.root.setAttribute('data-accent', this._accent());
    });
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.write(THEME_STORAGE_KEYS.mode, mode);
  }

  setAccent(accent: Accent): void {
    this._accent.set(accent);
    this.write(THEME_STORAGE_KEYS.accent, accent);
  }

  private read<T extends string>(key: string, isValid: (value: unknown) => value is T): T | null {
    try {
      const value = this.storage?.getItem(key);

      return isValid(value) ? value : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Cuota llena o almacenamiento bloqueado: la preferencia vale solo para
      // esta sesión.
    }
  }
}
