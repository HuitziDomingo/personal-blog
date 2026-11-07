import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { refreshInterceptor } from './core/http/refresh.interceptor';
import { ThemeService } from './core/theme/theme.service';

// Zoneless: Angular 22 no usa zone.js por defecto (ADR-012).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Crea ThemeService al arrancar, también en el login: toma el relevo del
    // script de index.html y sigue en vivo los cambios del tema del sistema.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // 'computed': si un guard cancela una navegación con el botón atrás del
    // navegador (el de cambios sin guardar), el historial vuelve a su sitio.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
    ),
    // El orden importa: el reintento del refresh ya lleva withCredentials.
    provideHttpClient(withInterceptors([credentialsInterceptor, refreshInterceptor])),
    // Sin provideSpartanHlm(): solo cambia el default de los overlays del CDK
    // (usePopover) para convivir con <hlm-toaster>, que el admin no usa, y su
    // import de @angular/cdk/overlay metería el overlay entero (~46 kB) en el
    // bundle inicial. Los diálogos usan el top layer nativo (popover).
  ],
};
