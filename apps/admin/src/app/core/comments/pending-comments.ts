import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { CommentsApi } from '../api/comments-api';

/**
 * Número de comentarios pendientes, para el badge del menú. Se pide al cargar
 * el menú y después de cada decisión en la cola; si la petición falla, el
 * badge no se muestra (`null`) y la cola enseña el error.
 */
@Injectable({ providedIn: 'root' })
export class PendingComments {
  private readonly api = inject(CommentsApi);
  private request: Subscription | null = null;

  readonly count = signal<number | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  /** Vuelve a pedir el total. Una petición en curso se cancela: gana la última. */
  refresh(): void {
    this.request?.unsubscribe();
    // limit=1: solo interesa `total`.
    this.request = this.api.list({ status: 'pending', limit: 1, offset: 0 }).subscribe({
      next: (page) => this.count.set(page.total),
      error: () => this.count.set(null),
    });
  }
}
