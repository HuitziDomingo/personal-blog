import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideCheck,
  lucideCircleCheck,
  lucideCircleX,
  lucideRefreshCw,
  lucideReply,
  lucideSend,
  lucideShieldAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { finalize, Observable } from 'rxjs';

import { Comment } from '../../core/api/api-types';
import { CommentsApi, MAX_REPLY_LENGTH } from '../../core/api/comments-api';
import { ApiError } from '../../core/http/api-error';
import { formatDateTime } from '../posts/post-display';
import { relativeTime, textSegments, verdictView } from './comment-display';

type Action = 'approve' | 'reject' | 'analyze' | 'reply';

const VERDICT_ICONS = {
  approve: 'lucideCircleCheck',
  reject: 'lucideCircleX',
  review: 'lucideShieldAlert',
  none: 'lucideBot',
} as const;

/** Lo que la cola necesita saber cuando el comentario cambia de estado. */
export interface CommentDecision {
  comment: Comment;
  action: 'approve' | 'reject';
}

/**
 * Tarjeta de un comentario en la cola de moderación (ADR-022, punto 5): la
 * sugerencia del modelo, y las acciones del autor. El contenido es texto no
 * confiable: se interpola como texto, nunca como HTML.
 */
@Component({
  selector: 'app-comment-card',
  imports: [RouterLink, NgIcon, HlmBadgeImports, HlmButtonImports, HlmLabelImports, HlmTextareaImports],
  providers: [
    provideIcons({
      lucideBot,
      lucideCheck,
      lucideCircleCheck,
      lucideCircleX,
      lucideRefreshCw,
      lucideReply,
      lucideSend,
      lucideShieldAlert,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './comment-card.css',
  template: `
    @let item = current();
    @let verdict = verdictInfo();
    <article
      class="comment-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5"
      [class.comment-card-review]="verdict.humanReview"
      [attr.aria-labelledby]="headingId()"
      [attr.aria-busy]="busy() !== null"
    >
      <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 [id]="headingId()" class="text-base font-semibold break-words">{{ item.name }}</h2>
            @if (item.byAuthor) {
              <span hlmBadge variant="outline">Autor</span>
            }
          </div>
          <p class="comment-muted text-sm">
            @if (item.postTitle) {
              en <a class="underline-offset-2 hover:underline" [routerLink]="['/posts', item.postId]">«{{ item.postTitle }}»</a>
            } @else {
              en un post que ya no existe
            }
            · <time [attr.datetime]="item.createdAt" [attr.title]="absoluteDate()">{{ relativeDate() }}</time>
            @if (item.parentId) {
              · respuesta a otro comentario
            }
          </p>
        </div>
        <span class="verdict inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" [attr.data-tone]="verdict.tone">
          <ng-icon [name]="verdictIcon()" aria-hidden="true" />{{ verdict.label }}
        </span>
      </header>

      <p class="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">@for (segment of segments(); track $index) {@if (segment.code) {<code class="comment-code">{{ segment.text }}</code>} @else {{{ segment.text }}}}</p>

      @if (item.moderation; as moderation) {
        <div class="comment-reason rounded-lg px-3 py-2 text-sm">
          <strong>Motivo del modelo:</strong> {{ moderation.reason }}
          <span class="comment-muted">({{ moderation.model }}, {{ formatDateTime(moderation.analyzedAt) }})</span>
        </div>
      }

      @if (error(); as message) {
        <p role="alert" class="comment-error text-sm">{{ message }}</p>
      }

      @if (replying()) {
        <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); sendReply()">
          <label hlmLabel [for]="replyId()">Tu respuesta como autor</label>
          <textarea
            #replyField
            hlmTextarea
            rows="3"
            [id]="replyId()"
            [attr.aria-describedby]="replyId() + '-count'"
            [maxLength]="maxReply"
            [value]="replyText()"
            (input)="replyText.set($any($event.target).value)"
          ></textarea>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span [id]="replyId() + '-count'" class="comment-muted text-xs">{{ replyText().length }} / {{ maxReply }}</span>
            <div class="flex gap-2">
              <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy() !== null" (click)="closeReply()">Cancelar</button>
              <button hlmBtn size="sm" type="submit" [disabled]="busy() !== null || !canSendReply()">
                <ng-icon name="lucideSend" aria-hidden="true" />{{ busy() === 'reply' ? 'Publicando…' : 'Publicar respuesta' }}
              </button>
            </div>
          </div>
        </form>
      }

      <div class="flex flex-wrap items-center justify-end gap-2">
        @if (canAnalyze()) {
          <button hlmBtn variant="ghost" size="sm" type="button" class="me-auto" [disabled]="busy() !== null" (click)="analyze()">
            <ng-icon name="lucideRefreshCw" aria-hidden="true" />{{ busy() === 'analyze' ? 'Analizando…' : 'Volver a analizar' }}
          </button>
        }
        @if (canReply() && !replying()) {
          <button hlmBtn variant="outline" size="sm" type="button" [disabled]="busy() !== null" (click)="openReply()">
            <ng-icon name="lucideReply" aria-hidden="true" />Responder
          </button>
        }
        @switch (item.status) {
          @case ('pending') {
            @if (rejectFirst()) {
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="busy() !== null" (click)="decide('approve')">
                <ng-icon name="lucideCheck" aria-hidden="true" />Aprobar de todos modos
              </button>
              <button hlmBtn size="sm" type="button" class="reject-button" [disabled]="busy() !== null" (click)="decide('reject')">
                <ng-icon name="lucideX" aria-hidden="true" />Rechazar
              </button>
            } @else {
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="busy() !== null" (click)="decide('reject')">
                <ng-icon name="lucideX" aria-hidden="true" />Rechazar
              </button>
              <button hlmBtn size="sm" type="button" [disabled]="busy() !== null" (click)="decide('approve')">
                <ng-icon name="lucideCheck" aria-hidden="true" />Aprobar y publicar
              </button>
            }
          }
          @case ('approved') {
            <button hlmBtn variant="outline" size="sm" type="button" [disabled]="busy() !== null" (click)="decide('reject')">
              <ng-icon name="lucideX" aria-hidden="true" />Rechazar
            </button>
          }
          @case ('rejected') {
            <button hlmBtn variant="outline" size="sm" type="button" [disabled]="busy() !== null" (click)="decide('approve')">
              <ng-icon name="lucideCheck" aria-hidden="true" />Aprobar
            </button>
          }
        }
      </div>
    </article>
  `,
})
export class CommentCard {
  private readonly api = inject(CommentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly replyField = viewChild<ElementRef<HTMLTextAreaElement>>('replyField');

  readonly comment = input.required<Comment>();
  /** Aprobado o rechazado: la cola lo saca de la pestaña. */
  readonly decided = output<CommentDecision>();
  /** Texto para la región viva de la cola. */
  readonly notice = output<string>();

  /** El comentario como está ahora: un análisis nuevo lo reemplaza sin recargar la cola. */
  protected readonly current = linkedSignal(() => this.comment());
  protected readonly busy = signal<Action | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly replying = signal(false);
  protected readonly replyText = signal('');

  protected readonly maxReply = MAX_REPLY_LENGTH;
  protected readonly formatDateTime = formatDateTime;

  protected readonly headingId = computed(() => `comentario-${this.current().id}`);
  protected readonly replyId = computed(() => `respuesta-${this.current().id}`);
  protected readonly verdictInfo = computed(() => verdictView(this.current().moderation));
  protected readonly verdictIcon = computed(() => VERDICT_ICONS[this.verdictInfo().tone]);
  protected readonly segments = computed(() => textSegments(this.current().content));
  protected readonly relativeDate = computed(() => relativeTime(this.current().createdAt));
  protected readonly absoluteDate = computed(() => formatDateTime(this.current().createdAt));

  /** Si el modelo sugiere rechazar o pide revisión humana, «Rechazar» es la acción principal. */
  protected readonly rejectFirst = computed(() => {
    const verdict = this.verdictInfo();
    return verdict.tone === 'reject' || verdict.humanReview;
  });
  /** Las respuestas del autor no pasan por el modelo. */
  protected readonly canAnalyze = computed(() => !this.current().byAuthor);
  /** Solo se responde a un comentario aprobado que no es respuesta (un nivel). */
  protected readonly canReply = computed(() => {
    const item = this.current();
    return item.status === 'approved' && !item.parentId && !item.byAuthor;
  });
  protected readonly canSendReply = computed(() => {
    const length = this.replyText().trim().length;
    return length > 0 && this.replyText().length <= MAX_REPLY_LENGTH;
  });

  protected decide(action: 'approve' | 'reject'): void {
    const item = this.current();
    const request = action === 'approve' ? this.api.approve(item.id) : this.api.reject(item.id);
    this.run(action, request, (updated) => this.decided.emit({ comment: updated, action }));
  }

  protected analyze(): void {
    this.run('analyze', this.api.analyze(this.current().id), (updated) => {
      this.current.set(updated);
      this.notice.emit(`Análisis actualizado para el comentario de ${updated.name}: ${verdictView(updated.moderation).label}.`);
    });
  }

  protected openReply(): void {
    this.error.set(null);
    this.replying.set(true);
    queueMicrotask(() => this.replyField()?.nativeElement.focus());
  }

  protected closeReply(): void {
    this.replying.set(false);
    this.replyText.set('');
  }

  protected sendReply(): void {
    if (!this.canSendReply() || this.busy() !== null) {
      return;
    }
    const item = this.current();
    this.run('reply', this.api.reply(item.id, this.replyText().trim()), () => {
      this.closeReply();
      this.notice.emit(`Se publicó tu respuesta a ${item.name}.`);
    });
  }

  private run(action: Action, request: Observable<Comment>, done: (comment: Comment) => void): void {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(action);
    this.error.set(null);
    request
      .pipe(
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: done,
        error: (error: unknown) =>
          this.error.set(error instanceof ApiError ? error.message : ApiError.from(error, 'comment').message),
      });
  }
}
