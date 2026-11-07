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
    // Las pantallas con sesión viven dentro del shell (BLOG-017). El shell va
    // en su propio chunk: trae el overlay del CDK que el login no necesita.
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./core/layout/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: 'posts',
        loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
      },
      { path: '', pathMatch: 'full', redirectTo: 'posts' },
    ],
  },
  { path: '**', redirectTo: 'posts' },
];
