import { Routes } from '@angular/router';

/** Pantallas de posts, cargadas en su propio chunk desde app.routes. */
export const POSTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Posts · Admin',
    loadComponent: () => import('./posts-list.page').then((m) => m.PostsListPage),
  },
];
