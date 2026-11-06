import { CanDeactivateFn } from '@angular/router';

import type { PostEditorPage } from './post-editor.page';

/**
 * Antes de salir del editor con cambios sin guardar, pide confirmación en un
 * diálogo del propio editor. Cerrar la pestaña o recargar lo cubre el
 * `beforeunload` de la página.
 */
export const unsavedChangesGuard: CanDeactivateFn<PostEditorPage> = (component) =>
  component.hasUnsavedChanges() ? component.confirmLeave() : true;
