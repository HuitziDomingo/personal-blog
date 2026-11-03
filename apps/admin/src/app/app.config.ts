import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { routes } from './app.routes';

// Zoneless: Angular 22 no usa zone.js por defecto (ADR-012).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideSpartanHlm(),
  ],
};
