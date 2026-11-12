import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleAlert,
  lucideInbox,
  lucideLoaderCircle,
  lucideRotateCw,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { catchError, map, Observable, of, startWith, switchMap } from 'rxjs';

import { CommentPage, CommentStatus } from '../../core/api/api-types';
import { CommentsApi, MAX_COMMENT_OFFSET } from '../../core/api/comments-api';
import { PendingComments } from '../../core/comments/pending-comments';
import { ApiError } from '../../core/http/api-error';
import { CommentCard, CommentDecision } from './comment-card';
import { COMMENT_STATUS_LABELS, COMMENT_STATUSES } from './comment-display';

/** Comentarios por página. El contrato admite hasta 100. */
export const COMMENTS_PAGE_SIZE = 20;

type QueueState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: CommentPage }
  | { kind: 'error'; message: string };

const EMPTY: Record<CommentStatus, { title: string; description: string }> = {
  pending: { title: 'No hay comentarios por revisar', description: 'Los comentarios nuevos aparecerán aquí antes de publicarse.' },
  approved: { title: 'Todavía no hay comentarios aprobados', description: 'Los que apruebes se verán en el post y aquí.' },
  rejected: { title: 'No hay comentarios rechazados', description: 'Los rechazados se borran a los 30 días.' },
};

/**
 * Cola de moderación de comentarios (ADR-022, BLOG-092). El modelo sugiere y
 * el autor decide. La pestaña y la página viven en la URL
 * (`?status=approved&offset=20`); sin `status`, la pestaña es «Pendientes».
 */
@Component({
  selector: 'app-comments-queue-page',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmEmptyImports, CommentCard],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucideCircleAlert, lucideInbox, lucideLoaderCircle, lucideRotateCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6' },
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 #heading tabindex="-1" class="text-2xl font-semibold outline-none">Comentarios</h1>
        <p class="text-muted-foreground text-sm">El modelo sugiere; tú decides. Nada se publica sin tu aprobación.</p>
      </div>

      <!-- Links y no role=tab: cada pestaña es una URL distinta. -->
      <nav aria-label="Estado de los comentarios" class="bg-muted flex flex-wrap gap-1 rounded-lg p-1">
        @for (tab of statuses; track tab) {
          <a
            class="focus-visible:ring-ring/50 pointer-coarse:h-11 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3"
            [class]="tab === activeStatus() ? 'bg-background text-foreground shadow-xs' : 'text-foreground hover:bg-background/60'"
            [routerLink]="[]"
            [queryParams]="{ status: tab === 'pending' ? null : tab, offset: null }"
            [attr.aria-current]="tab === activeStatus() ? 'page' : null"
            >{{ tabLabel(tab) }}</a
          >
        }
      </nav>
    </header>

    <!-- Una sola región viva, siempre en el DOM (como en la lista de posts). -->
    <p role="status" class="text-sm">{{ notice() }}</p>

    @switch (state().kind) {
      @case ('loading') {
        <p class="text-muted-foreground flex items-center gap-2 text-sm"><ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Cargando comentarios…</p>
      }
      @case ('error') {
        <div role="alert" class="border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <ng-icon name="lucideCircleAlert" class="text-destructive" aria-hidden="true" />
          <p class="min-w-0 flex-1 text-sm">{{ errorMessage() }}</p>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="retry()">
            <ng-icon name="lucideRotateCw" aria-hidden="true" />Reintentar
          </button>
        </div>
      }
      @case ('ready') {
        @let current = page();
        @if (current && current.items.length > 0) {
          <ul class="flex flex-col gap-4" [attr.aria-label]="statusLabels[activeStatus()]">
            @for (comment of current.items; track comment.id) {
              <li>
                <app-comment-card [comment]="comment" (decided)="onDecided($event)" (notice)="notice.set($event)" />
              </li>
            }
          </ul>

          @if (hasPrevious() || hasNext()) {
            <nav aria-label="Paginación" class="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <p class="text-muted-foreground text-sm">{{ rangeLabel() }}</p>
              <div class="flex gap-2">
                <button hlmBtn variant="outline" size="sm" type="button" [disabled]="!hasPrevious()" (click)="goTo(previousOffset())">
                  <ng-icon name="lucideChevronLeft" aria-hidden="true" />Anterior
                </button>
                <button hlmBtn variant="outline" size="sm" type="button" [disabled]="!hasNext()" (click)="goTo(nextOffset())">
                  Siguiente<ng-icon name="lucideChevronRight" aria-hidden="true" />
                </button>
              </div>
            </nav>
          }
        } @else {
          <section hlmEmpty class="flex-none" aria-labelledby="empty-title">
            <div hlmEmptyHeader>
              <div hlmEmptyMedia variant="icon" aria-hidden="true"><ng-icon name="lucideInbox" /></div>
              <h2 hlmEmptyTitle id="empty-title">{{ emptyText().title }}</h2>
              <p hlmEmptyDescription>{{ emptyText().description }}</p>
            </div>
            @if (currentOffset() > 0) {
              <div hlmEmptyContent>
                <button hlmBtn variant="outline" size="sm" type="button" (click)="goTo(0)">Ir a la primera página</button>
              </div>
            }
          </section>
        }
      }
    }
  `,
})
export class CommentsQueuePage {
  private readonly api = inject(CommentsApi);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingComments);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  /** Query params, enlazados por `withComponentInputBinding`. */
  readonly status = input<string>();
  readonly offset = input<string>();

  protected readonly statuses = COMMENT_STATUSES;
  protected readonly statusLabels = COMMENT_STATUS_LABELS;
  protected readonly pendingCount = this.pending.count;

  protected readonly activeStatus = computed(() => parseStatus(this.status()));
  protected readonly currentOffset = computed(() => parseOffset(this.offset()));

  private readonly reloads = signal(0);
  protected readonly state = toSignal(
    toObservable(
      computed(() => ({ status: this.activeStatus(), offset: this.currentOffset(), reload: this.reloads() })),
    ).pipe(switchMap(({ status, offset }) => this.load(status, offset))),
    { initialValue: { kind: 'loading' } as QueueState },
  );

  protected readonly page = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.page : null;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });
  protected readonly emptyText = computed(() =>
    this.currentOffset() > 0
      ? { title: 'Esta página no tiene comentarios', description: 'Puede que la lista haya cambiado desde que llegaste aquí.' }
      : EMPTY[this.activeStatus()],
  );

  protected readonly previousOffset = computed(() => Math.max(0, this.currentOffset() - COMMENTS_PAGE_SIZE));
  protected readonly nextOffset = computed(() => this.currentOffset() + COMMENTS_PAGE_SIZE);
  protected readonly hasPrevious = computed(() => this.currentOffset() > 0);
  protected readonly hasNext = computed(() => {
    const page = this.page();
    return page !== null && this.nextOffset() < page.total && this.nextOffset() <= MAX_COMMENT_OFFSET;
  });
  protected readonly rangeLabel = computed(() => {
    const page = this.page();
    if (!page) {
      return '';
    }
    return `${page.offset + 1}–${page.offset + page.items.length} de ${page.total}`;
  });

  protected readonly notice = signal('');

  constructor() {
    // En móvil el menú (y su badge) no está montado: la pestaña pide su número.
    this.pending.refresh();
  }

  /** «Pendientes · 3»: el número va en el mismo texto para que se lea junto. */
  protected tabLabel(tab: CommentStatus): string {
    const count = this.pendingCount();
    return tab === 'pending' && count !== null ? `${COMMENT_STATUS_LABELS[tab]} · ${count}` : COMMENT_STATUS_LABELS[tab];
  }

  protected goTo(offset: number): void {
    void this.router.navigate([], {
      queryParams: { offset: offset > 0 ? offset : null },
      queryParamsHandling: 'merge',
    });
  }

  protected retry(): void {
    this.reloads.update((n) => n + 1);
  }

  /** Aprobado o rechazado: sale de la pestaña, el badge se actualiza y el foco va al título. */
  protected onDecided({ comment, action }: CommentDecision): void {
    this.notice.set(
      action === 'approve'
        ? `Se aprobó el comentario de ${comment.name}: ya se ve en el post.`
        : `Se rechazó el comentario de ${comment.name}.`,
    );
    this.retry();
    this.pending.refresh();
    this.heading().nativeElement.focus();
  }

  private load(status: CommentStatus, offset: number): Observable<QueueState> {
    return this.api.list({ status, limit: COMMENTS_PAGE_SIZE, offset }).pipe(
      map((page): QueueState => ({ kind: 'ready', page })),
      catchError((error: unknown) =>
        of<QueueState>({
          kind: 'error',
          message: error instanceof ApiError ? error.message : ApiError.from(error, 'comment').message,
        }),
      ),
      startWith<QueueState>({ kind: 'loading' }),
    );
  }
}

function parseStatus(value: string | undefined): CommentStatus {
  return COMMENT_STATUSES.find((status) => status === value) ?? 'pending';
}

// Igual que en la lista de posts: un offset inválido se trata como 0.
function parseOffset(value: string | undefined): number {
  const offset = Number(value);
  return Number.isInteger(offset) && offset > 0 && offset <= MAX_COMMENT_OFFSET ? offset : 0;
}
