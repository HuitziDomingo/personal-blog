import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideLoaderCircle, lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { RagStatus, ReindexResult } from '../../core/api/api-types';
import { RagApi } from '../../core/api/rag-api';
import { ApiError } from '../../core/http/api-error';

type StatusState = { kind: 'loading' } | { kind: 'ready'; status: RagStatus } | { kind: 'error'; message: string };

type ReindexState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'running' }
  | { kind: 'done'; result: ReindexResult }
  | { kind: 'error'; message: string };

/**
 * Ajustes del admin. Por ahora, el índice de «mejorar con mi contexto»
 * (ADR-027): su estado y «Reindexar todo», que pide confirmación porque gasta
 * cuota de Gemini.
 */
@Component({
  selector: 'app-settings-page',
  imports: [HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideLoaderCircle, lucideRefreshCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass-card mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">Ajustes</h1>
    </header>

    <section aria-labelledby="rag-title" class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 id="rag-title" class="text-lg font-semibold">Contexto del asistente</h2>
        <p class="text-muted-foreground text-sm">
          «Mejorar con mi contexto» busca en tus posts publicados los fragmentos más parecidos al borrador. Cada post se
          indexa al publicarlo o editarlo; si Gemini falla, queda pendiente.
        </p>
      </div>

      @switch (status().kind) {
        @case ('loading') {
          <p class="text-muted-foreground flex items-center gap-2 text-sm" data-testid="rag-loading">
            <ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Cargando el
            estado del índice…
          </p>
        }
        @case ('error') {
          <div role="alert" class="border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <ng-icon name="lucideCircleAlert" class="text-destructive" aria-hidden="true" />
            <p class="min-w-0 flex-1 text-sm">{{ statusError() }}</p>
            <button hlmBtn variant="outline" size="sm" type="button" (click)="loadStatus()">Reintentar</button>
          </div>
        }
        @case ('ready') {
          @let rag = currentStatus()!;
          @if (!rag.enabled) {
            <p class="rounded-lg border p-3 text-sm" data-testid="rag-disabled">
              Está apagado en la API (<code>RAG_ENABLED=false</code>). Para usarlo, enciéndelo junto con el asistente; el
              botón aparecerá en el editor.
            </p>
          } @else {
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]" data-testid="rag-status">
              <dt class="text-muted-foreground">Modelo</dt>
              <dd><code>{{ rag.model }}</code></dd>
              <dt class="text-muted-foreground">Posts publicados</dt>
              <dd>{{ rag.publishedPosts }}</dd>
              <dt class="text-muted-foreground">Indexados</dt>
              <dd>{{ rag.indexedPosts }}</dd>
              <dt class="text-muted-foreground">Pendientes</dt>
              <dd>{{ rag.pendingPosts }}</dd>
              <dt class="text-muted-foreground">Fragmentos</dt>
              <dd>{{ rag.chunks }}</dd>
            </dl>

            @switch (reindex().kind) {
              @case ('confirming') {
                <div class="flex flex-col gap-3 rounded-lg border p-3" role="group" aria-labelledby="reindex-confirm-text">
                  <p id="reindex-confirm-text" class="text-sm">
                    Se volverán a generar los embeddings de {{ postsLabel(rag.publishedPosts) }} con Gemini. Gasta cuota del
                    plan gratuito y puede tardar un par de minutos.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button #confirmButton hlmBtn size="sm" type="button" (click)="runReindex()">Sí, reindexar</button>
                    <button hlmBtn variant="outline" size="sm" type="button" (click)="cancelReindex()">Cancelar</button>
                  </div>
                </div>
              }
              @default {
                <div>
                  <button
                    #reindexButton
                    hlmBtn
                    variant="outline"
                    type="button"
                    [disabled]="reindex().kind === 'running'"
                    [attr.aria-busy]="reindex().kind === 'running'"
                    (click)="askReindex()"
                  >
                    @if (reindex().kind === 'running') {
                      <ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Reindexando…
                    } @else {
                      <ng-icon name="lucideRefreshCw" aria-hidden="true" />Reindexar todo
                    }
                  </button>
                </div>
              }
            }

            @if (reindexError(); as message) {
              <div role="alert" class="border-destructive/40 bg-destructive/5 flex items-center gap-3 rounded-lg border p-3">
                <ng-icon name="lucideCircleAlert" class="text-destructive" aria-hidden="true" />
                <p class="min-w-0 flex-1 text-sm">{{ message }}</p>
              </div>
            }
          }
        }
      }

      <!-- Una sola región viva para el resultado del reindexado. -->
      <p aria-live="polite" aria-atomic="true" class="text-sm empty:sr-only" data-testid="rag-announcement">{{ announcement() }}</p>
    </section>
  `,
})
export class SettingsPage {
  private readonly api = inject(RagApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly status = signal<StatusState>({ kind: 'loading' });
  protected readonly reindex = signal<ReindexState>({ kind: 'idle' });
  protected readonly announcement = signal('');

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly reindexButton = viewChild<ElementRef<HTMLButtonElement>>('reindexButton');

  constructor() {
    this.loadStatus();
  }

  protected currentStatus(): RagStatus | null {
    const state = this.status();
    return state.kind === 'ready' ? state.status : null;
  }

  protected statusError(): string {
    const state = this.status();
    return state.kind === 'error' ? state.message : '';
  }

  protected reindexError(): string | null {
    const state = this.reindex();
    return state.kind === 'error' ? state.message : null;
  }

  protected postsLabel(count: number): string {
    return count === 1 ? '1 post publicado' : `${count} posts publicados`;
  }

  protected loadStatus(): void {
    this.status.set({ kind: 'loading' });
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => this.status.set({ kind: 'ready', status }),
        error: (error: unknown) => this.status.set({ kind: 'error', message: messageOf(error) }),
      });
  }

  protected askReindex(): void {
    this.announcement.set('');
    this.reindex.set({ kind: 'confirming' });
    this.focus(() => this.confirmButton());
  }

  protected cancelReindex(): void {
    this.reindex.set({ kind: 'idle' });
    this.focus(() => this.reindexButton());
  }

  protected runReindex(): void {
    this.reindex.set({ kind: 'running' });
    this.announcement.set('Reindexando tus posts publicados…');
    this.focus(() => this.reindexButton());

    this.api
      .reindex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.reindex.set({ kind: 'done', result });
          this.announcement.set(reindexSummary(result));
          this.reloadStatusQuietly();
        },
        error: (error: unknown) => {
          this.reindex.set({ kind: 'error', message: messageOf(error) });
          this.announcement.set('');
        },
      });
  }

  /** Actualiza los contadores sin volver al estado de carga. */
  private reloadStatusQuietly(): void {
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (status) => this.status.set({ kind: 'ready', status }), error: () => undefined });
  }

  private focus(target: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}

/** El resultado en una frase, para la región viva. */
export function reindexSummary(result: ReindexResult): string {
  const parts = [`Listo: ${result.indexed} de ${result.posts} posts indexados, con ${result.chunks} fragmentos.`];
  if (result.pending > 0) {
    parts.push(
      `${result.pending === 1 ? '1 quedó pendiente' : `${result.pending} quedaron pendientes`} porque Gemini falló o agotó su cuota; inténtalo más tarde.`,
    );
  }
  if (result.removed > 0) {
    parts.push(`Se quitaron del índice ${result.removed === 1 ? '1 post que ya no está publicado' : `${result.removed} posts que ya no están publicados`}.`);
  }

  return parts.join(' ');
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Error inesperado del servidor. Inténtalo de nuevo.';
}
