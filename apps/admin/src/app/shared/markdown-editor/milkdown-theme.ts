import { DOCUMENT, inject, InjectionToken } from '@angular/core';

/**
 * Nombre del archivo que genera angular.json para milkdown-theme.css
 * (`bundleName`, con `inject: false`: sin hash y sin <link> en index.html).
 */
export const MILKDOWN_THEME_HREF = 'milkdown-theme.css';

export interface MilkdownThemeLoader {
  /** Agrega la hoja del tema una sola vez y resuelve cuando cargó o falló. */
  load(): Promise<void>;
}

/**
 * Carga el tema de Milkdown con un <link>, desde el mismo origen: lo permite
 * el `style-src 'self'` de la CSP. En los tests se reemplaza por un fake,
 * porque jsdom no carga hojas de estilo ni dispara `load`.
 */
export const MILKDOWN_THEME_LOADER = new InjectionToken<MilkdownThemeLoader>('MILKDOWN_THEME_LOADER', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    let loading: Promise<void> | undefined;

    return {
      load: () =>
        (loading ??= new Promise<void>((resolve) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = MILKDOWN_THEME_HREF;
          // Si falla, el editor funciona sin tema: no se bloquea.
          link.addEventListener('load', () => resolve(), { once: true });
          link.addEventListener('error', () => resolve(), { once: true });
          document.head.append(link);
        })),
    };
  },
});
