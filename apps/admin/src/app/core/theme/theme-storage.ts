import { DOCUMENT, inject, InjectionToken } from '@angular/core';

/**
 * Devuelve `localStorage`, o `null` si el navegador no deja usarlo: con los
 * datos del sitio bloqueados, solo leer la propiedad lanza `SecurityError`.
 */
export function localStorageOf(view: Window | null): Storage | null {
  try {
    return view?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Dónde se guardan las preferencias de apariencia. `null` si no hay dónde. */
export const THEME_STORAGE = new InjectionToken<Storage | null>('THEME_STORAGE', {
  providedIn: 'root',
  factory: () => localStorageOf(inject(DOCUMENT).defaultView),
});
