import { Routes } from '@angular/router';

import { anyoneGuard, authGuard, guestGuard } from './core/session/session.guards';

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
    // Pública (BLOG-130): la atribución CC BY-SA de los fondos tiene que poder
    // verse desde el login, sin sesión. Va fuera del shell, como el login.
    path: 'creditos',
    title: 'Créditos · Admin',
    canMatch: [anyoneGuard],
    loadComponent: () => import('./features/credits/credits.page').then((m) => m.CreditsPage),
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
      {
        path: 'comments',
        title: 'Comentarios · Admin',
        loadComponent: () => import('./features/comments/comments-queue.page').then((m) => m.CommentsQueuePage),
      },
      {
        path: 'cv',
        title: 'CV · Admin',
        loadComponent: () => import('./features/cv/cv.page').then((m) => m.CvPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'posts' },
    ],
  },
  { path: '**', redirectTo: 'posts' },
];
