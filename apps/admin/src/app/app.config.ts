import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

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
    provideSpartanHlm(),
  ],
};
