import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { refreshInterceptor } from './core/http/refresh.interceptor';

// Zoneless: Angular 22 no usa zone.js por defecto (ADR-012).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // El orden importa: el reintento del refresh ya lleva withCredentials.
    provideHttpClient(withInterceptors([credentialsInterceptor, refreshInterceptor])),
    // Sin provideSpartanHlm(): solo cambia el default de los overlays del CDK
    // (usePopover) para convivir con <hlm-toaster>, que el admin no usa, y su
    // import de @angular/cdk/overlay metería el overlay entero (~46 kB) en el
    // bundle inicial. Los diálogos usan el top layer nativo (popover).
  ],
};
