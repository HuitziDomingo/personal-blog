import { DestroyRef, DOCUMENT, inject, InjectionToken, Signal, signal } from '@angular/core';

export type MatchMedia = (query: string) => MediaQueryList;

/**
 * `window.matchMedia`, o `null` si el entorno no la tiene (jsdom no la
 * implementa). Los tests la reemplazan con un fake (ADR-015).
 */
export const MATCH_MEDIA = new InjectionToken<MatchMedia | null>('MATCH_MEDIA', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;

    return typeof view?.matchMedia === 'function' ? (query) => view.matchMedia(query) : null;
  },
});

/**
 * Signal que vale lo que la media query y cambia en vivo. Sin `matchMedia`,
 * vale `false`. Hay que llamarla en un contexto de inyección: quita el
 * listener al destruirse quien la creó.
 */
export function injectMediaQuery(query: string): Signal<boolean> {
  const list = inject(MATCH_MEDIA)?.(query) ?? null;
  const matches = signal(list?.matches ?? false);

  if (list) {
    const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
    list.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => list.removeEventListener('change', onChange));
  }

  return matches.asReadonly();
}
