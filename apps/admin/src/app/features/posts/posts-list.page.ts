import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { catchError, finalize, map, Observable, of, startWith, switchMap } from 'rxjs';

import { PostPage, PostStatus, PostSummary } from '../../core/api/api-types';
import { MAX_POST_OFFSET, PostsApi } from '../../core/api/posts-api';
import { ApiError } from '../../core/http/api-error';
import { SessionService } from '../../core/session/session.service';
import { formatDateTime, POST_STATUS_LABELS, POST_STATUSES } from './post-display';

/** Posts por página. El contrato admite hasta 100 (`MAX_POST_LIMIT`). */
export const PAGE_SIZE = 20;

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: PostPage }
  | { kind: 'error'; message: string };

/**
 * Lista de posts del admin, en cualquier estado. El filtro y la página viven
 * en la URL (`?status=…&offset=…`), así que recargar o volver atrás conserva
 * la vista.
 */
@Component({
  selector: 'app-posts-list-page',
  imports: [HlmAlertDialogImports, HlmBadgeImports, HlmButtonImports, HlmEmptyImports, HlmTableImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6' },
  template: `
    <header class="flex flex-wrap items-center justify-between gap-4">
      <h1 #heading tabindex="-1" class="text-2xl font-semibold outline-none">Posts</h1>
      <button hlmBtn variant="outline" type="button" [disabled]="loggingOut()" (click)="logout()">
        Cerrar sesión
      </button>
    </header>

    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1 text-sm font-medium" for="status-filter">
        Estado
        <select
          id="status-filter"
          class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2.5 text-sm font-normal outline-none focus-visible:ring-3"
          (change)="filterBy($any($event.target).value)"
        >
          <!-- [selected] en cada opción: un [value] en el select se aplicaría
               antes de que el @for cree las opciones. -->
          <option value="" [selected]="!statusFilter()">Todos</option>
          @for (status of statuses; track status) {
            <option [value]="status" [selected]="statusFilter() === status">{{ statusLabels[status] }}</option>
          }
        </select>
      </label>
    </div>

    <!-- Una sola región viva, siempre en el DOM: un role="status" que se
         inserta con el texto ya puesto no se anuncia de forma fiable. -->
    <p role="status" class="text-sm empty:hidden">{{ notice() }}</p>
    @if (pageError(); as message) {
      <p role="alert" class="text-destructive text-sm">{{ message }}</p>
    }

    @switch (state().kind) {
      @case ('loading') {
        <p class="text-muted-foreground text-sm">Cargando posts…</p>
      }
      @case ('error') {
        <div role="alert" class="flex flex-wrap items-center gap-3">
          <p class="text-destructive text-sm">{{ errorMessage() }}</p>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="retry()">Reintentar</button>
        </div>
      }
      @case ('ready') {
        @let current = page();
        @if (current && current.items.length > 0) {
          <div hlmTableContainer>
            <table hlmTable>
              <caption class="sr-only">Posts{{ statusFilter() ? ', ' + statusLabels[statusFilter()!] : '' }}</caption>
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh scope="col">Título</th>
                  <th hlmTh scope="col">Estado</th>
                  <th hlmTh scope="col">Publicado</th>
                  <th hlmTh scope="col">Última edición</th>
                  <th hlmTh scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (post of current.items; track post.id) {
                  <tr hlmTr>
                    <td hlmTd class="max-w-xs truncate font-medium" [attr.title]="post.title">{{ post.title }}</td>
                    <td hlmTd>
                      <span hlmBadge [variant]="badgeVariant(post.status)">{{ statusLabels[post.status] }}</span>
                    </td>
                    <td hlmTd>
                      @if (post.publishedAt) {
                        <time [attr.datetime]="post.publishedAt">{{ formatDateTime(post.publishedAt) }}</time>
                      } @else {
                        <span class="text-muted-foreground">Sin publicar</span>
                      }
                    </td>
                    <td hlmTd>
                      <time [attr.datetime]="post.updatedAt">{{ formatDateTime(post.updatedAt) }}</time>
                    </td>
                    <td hlmTd class="text-right">
                      @if (post.status !== 'archived') {
                        <button
                          hlmBtn
                          variant="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="'Archivar «' + post.title + '»'"
                          (click)="askArchive(post)"
                        >
                          Archivar
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <nav aria-label="Paginación" class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-muted-foreground text-sm">{{ rangeLabel() }}</p>
            <div class="flex gap-2">
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="!hasPrevious()" (click)="goTo(previousOffset())">
                Anterior
              </button>
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="!hasNext()" (click)="goTo(nextOffset())">
                Siguiente
              </button>
            </div>
          </nav>
        } @else {
          <section hlmEmpty aria-labelledby="empty-title">
            <div hlmEmptyHeader>
              <h2 hlmEmptyTitle id="empty-title">{{ emptyTitle() }}</h2>
              <p hlmEmptyDescription>{{ emptyDescription() }}</p>
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

    <hlm-alert-dialog [state]="archiveTarget() ? 'open' : 'closed'" (closed)="cancelArchive()">
      <hlm-alert-dialog-content *hlmAlertDialogPortal>
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>¿Archivar este post?</h2>
          <p hlmAlertDialogDescription>
            «{{ archiveTarget()?.title }}» dejará de verse en el blog. Podrás encontrarlo con el filtro «Archivado».
          </p>
        </hlm-alert-dialog-header>
        @if (archiveError(); as message) {
          <p role="alert" class="text-destructive text-sm">{{ message }}</p>
        }
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel [disabled]="archiving()">Cancelar</button>
          <button hlmAlertDialogAction variant="destructive" [disabled]="archiving()" (click)="confirmArchive()">
            Archivar
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class PostsListPage {
  private readonly api = inject(PostsApi);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  /** Query params, enlazados por `withComponentInputBinding`. */
  readonly status = input<string>();
  readonly offset = input<string>();

  protected readonly statuses = POST_STATUSES;
  protected readonly statusLabels = POST_STATUS_LABELS;
  protected readonly formatDateTime = formatDateTime;

  protected readonly statusFilter = computed(() => parseStatus(this.status()));
  protected readonly currentOffset = computed(() => parseOffset(this.offset()));

  private readonly reloads = signal(0);
  protected readonly state = toSignal(
    toObservable(
      computed(() => ({ status: this.statusFilter(), offset: this.currentOffset(), reload: this.reloads() })),
    ).pipe(switchMap(({ status, offset }) => this.load(status, offset))),
    { initialValue: { kind: 'loading' } as ListState },
  );

  protected readonly page = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.page : null;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly previousOffset = computed(() => Math.max(0, this.currentOffset() - PAGE_SIZE));
  protected readonly nextOffset = computed(() => this.currentOffset() + PAGE_SIZE);
  protected readonly hasPrevious = computed(() => this.currentOffset() > 0);
  protected readonly hasNext = computed(() => {
    const page = this.page();
    return page !== null && this.nextOffset() < page.total && this.nextOffset() <= MAX_POST_OFFSET;
  });
  protected readonly rangeLabel = computed(() => {
    const page = this.page();
    if (!page) {
      return '';
    }
    const first = page.offset + 1;
    const last = page.offset + page.items.length;
    return `${first}–${last} de ${page.total}`;
  });

  protected readonly emptyTitle = computed(() => {
    if (this.currentOffset() > 0) {
      return 'Esta página no tiene posts';
    }
    const status = this.statusFilter();
    return status ? `No hay posts en «${POST_STATUS_LABELS[status]}»` : 'Todavía no hay posts';
  });
  protected readonly emptyDescription = computed(() =>
    this.currentOffset() > 0
      ? 'Puede que la lista haya cambiado desde que llegaste aquí.'
      : this.statusFilter()
        ? 'Prueba con otro estado.'
        : 'Los posts que crees aparecerán aquí.',
  );

  protected readonly archiveTarget = signal<PostSummary | null>(null);
  protected readonly archiving = signal(false);
  protected readonly archiveError = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly pageError = signal<string | null>(null);
  protected readonly loggingOut = signal(false);

  protected badgeVariant(status: PostStatus): 'default' | 'secondary' | 'outline' {
    return status === 'published' ? 'default' : status === 'draft' ? 'secondary' : 'outline';
  }

  protected filterBy(value: string): void {
    void this.router.navigate([], {
      queryParams: { status: parseStatus(value) ?? null, offset: null },
      queryParamsHandling: 'merge',
    });
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

  protected askArchive(post: PostSummary): void {
    this.archiveError.set(null);
    this.pageError.set(null);
    this.archiveTarget.set(post);
  }

  // El diálogo se puede cerrar con Escape aunque haya una petición en curso: el
  // estado se limpia siempre, para que [state] vuelva a 'closed' y el diálogo
  // se pueda abrir otra vez. La petición sigue y su resultado se muestra en la
  // página.
  protected cancelArchive(): void {
    this.archiveTarget.set(null);
  }

  protected confirmArchive(): void {
    const post = this.archiveTarget();
    if (!post || this.archiving()) {
      return;
    }

    this.archiving.set(true);
    this.archiveError.set(null);
    this.notice.set('');

    this.api
      .archive(post.id)
      .pipe(
        finalize(() => this.archiving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (this.archiveTarget() === post) {
            this.archiveTarget.set(null);
          }
          this.notice.set(`Se archivó «${post.title}».`);
          this.retry();
          // El botón que abrió el diálogo puede desaparecer con la recarga (por
          // ejemplo, con el filtro Publicados): el foco va al título.
          this.heading().nativeElement.focus();
        },
        error: (error: unknown) => {
          const message = messageOf(error);
          // Si el diálogo ya se cerró, el error va a la página.
          if (this.archiveTarget() === post) {
            this.archiveError.set(message);
          } else {
            this.pageError.set(`No se pudo archivar «${post.title}». ${message}`);
          }
        },
      });
  }

  protected logout(): void {
    this.loggingOut.set(true);
    this.session.logout().subscribe();
  }

  private load(status: PostStatus | undefined, offset: number): Observable<ListState> {
    return this.api.list({ status, limit: PAGE_SIZE, offset }).pipe(
      map((page): ListState => ({ kind: 'ready', page })),
      catchError((error: unknown) => of<ListState>({ kind: 'error', message: messageOf(error) })),
      startWith<ListState>({ kind: 'loading' }),
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : ApiError.from(error, 'post').message;
}

function parseStatus(value: string | undefined): PostStatus | undefined {
  return POST_STATUSES.find((status) => status === value);
}

// Un offset que no es un entero entre 0 y el máximo del contrato se trata como
// 0, en vez de mandarle a la API algo que respondería 400.
function parseOffset(value: string | undefined): number {
  const offset = Number(value);
  return Number.isInteger(offset) && offset > 0 && offset <= MAX_POST_OFFSET ? offset : 0;
}
