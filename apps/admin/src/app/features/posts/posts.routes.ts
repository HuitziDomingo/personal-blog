import { Routes } from '@angular/router';

import { provideFakeWritingAssistant } from '../../core/assistant/fake-writing-assistant';
import { unsavedChangesGuard } from './unsaved-changes.guard';

/**
 * Pantallas de posts, cargadas en su propio chunk desde app.routes. El editor
 * va en otro chunk: marked y DOMPurify solo se descargan al abrirlo.
 */
export const POSTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Posts · Admin',
    loadComponent: () => import('./posts-list.page').then((m) => m.PostsListPage),
  },
  {
    // `/posts/new` y `/posts/:id` comparten ruta para que, al crear, Angular
    // reutilice el componente al pasar a la URL del post nuevo.
    path: ':id',
    title: 'Editor de posts · Admin',
    canDeactivate: [unsavedChangesGuard],
    // El asistente de escritura (BLOG-072): hoy, el falso, sin red.
    providers: [provideFakeWritingAssistant()],
    loadComponent: () => import('./post-editor.page').then((m) => m.PostEditorPage),
  },
];
