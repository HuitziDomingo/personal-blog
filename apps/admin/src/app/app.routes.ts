import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/session/session.guards';

// Las pantallas se cargan por ruta (ADR-012). Toda ruta tiene un guard, así
// que la primera navegación resuelve la sesión con /auth/me.
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Admin',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'posts',
    canMatch: [authGuard],
    loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'posts' },
  { path: '**', redirectTo: 'posts' },
];
