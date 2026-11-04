import { InjectionToken } from '@angular/core';

/**
 * Origen de la API, sin barra final. El build lo reemplaza con el `define` de la
 * configuración activa en `angular.json`: `development` apunta a la API local y
 * `production` al dominio de la API. `scripts/check-api-base-url.mjs` exige que
 * el de producción sea un origen https.
 */
declare const ADMIN_API_BASE_URL: string;

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => ADMIN_API_BASE_URL,
});
