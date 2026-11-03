import { Routes } from '@angular/router';

// Las pantallas se cargan por ruta (ADR-012). Las rutas protegidas y sus
// guards llegan con BLOG-016.
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Admin',
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
