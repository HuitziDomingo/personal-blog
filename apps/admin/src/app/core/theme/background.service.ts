import { computed, DestroyRef, DOCUMENT, inject, Injectable, InjectionToken, signal } from '@angular/core';

import {
  BACKGROUND_STORAGE_KEY,
  BackgroundId,
  BACKGROUNDS,
  BackgroundVariant,
  DEFAULT_BACKGROUND,
  isBackground,
} from './backgrounds';
import { THEME_STORAGE } from './theme-storage';
import { ThemeService } from './theme.service';

/** Atributo que el script de index.html pone en <html> si la carga empezó en /login. */
export const LOGIN_BACKGROUND_ATTRIBUTE = 'data-login-background';

/** Elige un fondo de la colección. Los tests lo reemplazan para que no sea aleatorio. */
export type PickBackground = (backgrounds: readonly BackgroundId[]) => BackgroundId;

export const PICK_BACKGROUND = new InjectionToken<PickBackground>('PICK_BACKGROUND', {
  providedIn: 'root',
  factory: () => (backgrounds) => backgrounds[Math.floor(Math.random() * backgrounds.length)] ?? DEFAULT_BACKGROUND,
});

/**
 * Fondo de pantalla del admin (BLOG-121): el elegido en el menú, guardado en
 * localStorage como el tema y el acento, y el del login, aleatorio en cada
 * carga. La versión clara u oscura sigue al tema.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundService {
  private readonly storage = inject(THEME_STORAGE);
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);

  private readonly _selected = signal<BackgroundId>(this.read());
  readonly selected = this._selected.asReadonly();

  readonly variant = computed<BackgroundVariant>(() => (this.theme.isDark() ? 'dark' : 'light'));

  /**
   * El del login: el que eligió (y precargó) el script de index.html si la
   * carga empezó en /login; si no, uno al azar ahora.
   */
  readonly loginBackground: BackgroundId;

  constructor() {
    const fromScript = this.document.documentElement.getAttribute(LOGIN_BACKGROUND_ATTRIBUTE);
    this.loginBackground = isBackground(fromScript) ? fromScript : inject(PICK_BACKGROUND)(BACKGROUNDS);
    this.followOtherTabs();
  }

  setBackground(background: BackgroundId): void {
    this._selected.set(background);
    try {
      this.storage?.setItem(BACKGROUND_STORAGE_KEY, background);
    } catch {
      // Cuota llena o almacenamiento bloqueado: vale solo para esta sesión.
    }
  }

  private read(): BackgroundId {
    try {
      const value = this.storage?.getItem(BACKGROUND_STORAGE_KEY);

      return isBackground(value) ? value : DEFAULT_BACKGROUND;
    } catch {
      return DEFAULT_BACKGROUND;
    }
  }

  private followOtherTabs(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === BACKGROUND_STORAGE_KEY) {
        this._selected.set(isBackground(event.newValue) ? event.newValue : DEFAULT_BACKGROUND);
      }
    };
    view.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => view.removeEventListener('storage', onStorage));
  }
}
