import { InjectionToken } from '@angular/core';

/**
 * Origen de la API, sin barra final. En local la API escucha en el puerto 8080
 * (ADR-012: admin y API en orígenes distintos, también en desarrollo). El valor
 * de producción se define con el despliegue (BLOG-047).
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:8080',
});
