import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { map, Observable, Subscription } from 'rxjs';

import { AssistantError, CoverIdea, MetadataSuggestion, WritingAssistant } from '../../core/assistant/writing-assistant';

export type AssistantAction = 'improve' | 'metadata' | 'cover';

type Suggestion =
  | { action: 'improve'; content: string }
  | { action: 'metadata'; metadata: MetadataSuggestion }
  | { action: 'cover'; cover: CoverIdea };

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading'; action: AssistantAction }
  | { kind: 'error'; action: AssistantAction; message: string }
  | { kind: 'ready'; suggestion: Suggestion };

const ACTIONS: AssistantAction[] = ['improve', 'metadata', 'cover'];

const ACTION_LABELS: Record<AssistantAction, string> = {
  improve: 'Mejorar redacción',
  metadata: 'Sugerir título, extracto y tags',
  cover: 'Idea de imagen de portada',
};

/**
 * Panel «Asistente» del editor: pide sugerencias a WritingAssistant y deja
 * aplicarlas o descartarlas. Nunca cambia el formulario por su cuenta: solo
 * emite lo que el autor aplica, y la redacción aplicada se puede deshacer.
 */
@Component({
  selector: 'app-assistant-panel',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="assistant-title" class="border-input flex flex-col gap-3 rounded-md border p-4">
      <div class="flex flex-col gap-1">
        <h2 id="assistant-title" class="text-base font-semibold">Asistente</h2>
        <p class="text-muted-foreground text-sm" data-testid="assistant-notice">{{ notice }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        @for (action of actions; track action) {
          <button
            #actionButton
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [attr.data-action]="action"
            [disabled]="disabled() || state().kind === 'loading'"
            (click)="request(action)"
          >
            {{ labels[action] }}
          </button>
        }
      </div>

      <!-- Una sola región viva, con textos cortos; los errores van en role=alert.
           Sin role=status: el editor ya tiene el suyo para los avisos de guardado. -->
      <p aria-live="polite" aria-atomic="true" data-testid="assistant-announcement" class="text-muted-foreground min-h-5 text-sm">
        {{ announcement() }}
      </p>

      @if (canUndo()) {
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span>Se reemplazó el contenido con la redacción sugerida.</span>
          <button hlmBtn variant="outline" size="sm" type="button" [disabled]="disabled()" (click)="undo()">Deshacer</button>
        </div>
      }

      @switch (state().kind) {
        @case ('error') {
          <div role="alert" class="flex flex-wrap items-center gap-3">
            <p class="text-destructive text-sm">{{ errorMessage() }}</p>
            <button #retryButton hlmBtn variant="outline" size="sm" type="button" [disabled]="disabled()" (click)="retry()">
              Reintentar
            </button>
          </div>
        }
        @case ('ready') {
          @let suggestion = currentSuggestion()!;
          <article
            #suggestionCard
            tabindex="-1"
            aria-labelledby="suggestion-title"
            class="bg-muted/50 flex flex-col gap-3 rounded-md p-3 text-sm outline-none"
          >
            @switch (suggestion.action) {
              @case ('improve') {
                <h3 id="suggestion-title" class="font-medium">Redacción sugerida</h3>
                <pre class="font-mono text-xs whitespace-pre-wrap">{{ suggestion.content }}</pre>
                <p class="text-muted-foreground">Aplicar reemplaza el contenido completo; podrás deshacerlo.</p>
              }
              @case ('metadata') {
                <h3 id="suggestion-title" class="font-medium">Título, extracto y tags</h3>
                <dl class="grid gap-1">
                  <dt class="text-muted-foreground">Título</dt>
                  <dd>{{ suggestion.metadata.title }}</dd>
                  <dt class="text-muted-foreground">Extracto</dt>
                  <dd>{{ suggestion.metadata.excerpt }}</dd>
                  <dt class="text-muted-foreground">Tags</dt>
                  <dd>{{ suggestion.metadata.tags.join(', ') }}</dd>
                </dl>
              }
              @case ('cover') {
                <h3 id="suggestion-title" class="font-medium">Idea de portada</h3>
                <p class="select-all">{{ suggestion.cover.description }}</p>
                <p><span class="text-muted-foreground">Texto alternativo:</span> {{ suggestion.cover.altText }}</p>
                <p class="text-muted-foreground">Es solo una idea: el post todavía no tiene campo de portada.</p>
              }
            }
            <div class="flex gap-2">
              <button hlmBtn size="sm" type="button" [disabled]="disabled()" (click)="apply(suggestion)">
                {{ suggestion.action === 'cover' ? 'Copiar' : 'Aplicar' }}
              </button>
              <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="disabled()" (click)="discard()">Descartar</button>
            </div>
          </article>
        }
      }
    </section>
  `,
})
export class AssistantPanel {
  private readonly assistant = inject(WritingAssistant);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly title = input('');
  readonly content = input('');
  /** Mientras el editor guarda, nada del panel cambia el formulario. */
  readonly disabled = input(false);

  /** El autor aplicó una redacción (o la deshizo): reemplaza el contenido. */
  readonly applyContent = output<string>();
  /** El autor aplicó título, extracto y tags. */
  readonly applyMetadata = output<MetadataSuggestion>();

  /** Sin idea de portada si la implementación no la ofrece (ADR-021, punto 1). */
  protected readonly actions = ACTIONS.filter((action) => action !== 'cover' || this.assistant.suggestsCover);
  protected readonly notice = this.assistant.notice;
  protected readonly labels = ACTION_LABELS;
  protected readonly state = signal<PanelState>({ kind: 'idle' });
  protected readonly announcement = signal('');
  /** Contenido anterior a la última redacción aplicada, para deshacerla. */
  private readonly undoContent = signal<string | null>(null);
  private readonly appliedContent = signal<string | null>(null);
  /** Deshacer solo mientras el contenido siga siendo el aplicado: si el autor
   * lo editó después, deshacer pisaría sus cambios. */
  protected readonly canUndo = computed(() => this.undoContent() !== null && this.content() === this.appliedContent());

  private readonly actionButtons = viewChildren<ElementRef<HTMLButtonElement>>('actionButton');
  private readonly suggestionCard = viewChild<ElementRef<HTMLElement>>('suggestionCard');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private pending?: Subscription;

  protected errorMessage(): string {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  }

  protected currentSuggestion(): Suggestion | null {
    const state = this.state();
    return state.kind === 'ready' ? state.suggestion : null;
  }

  protected request(action: AssistantAction): void {
    this.pending?.unsubscribe();
    this.state.set({ kind: 'loading', action });
    this.announcement.set(`Pensando: ${ACTION_LABELS[action]}…`);

    const draft = { title: this.title(), content: this.content() };
    const suggestion$: Observable<Suggestion> =
      action === 'improve'
        ? this.assistant.improveWriting(draft).pipe(map((content) => ({ action: 'improve' as const, content })))
        : action === 'metadata'
          ? this.assistant.suggestMetadata(draft).pipe(map((metadata) => ({ action: 'metadata' as const, metadata })))
          : this.assistant.suggestCover(draft).pipe(map((cover) => ({ action: 'cover' as const, cover })));

    this.pending = suggestion$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (suggestion) => {
        this.state.set({ kind: 'ready', suggestion });
        this.announcement.set('Sugerencia lista.');
        // El foco pasa a la sugerencia, que acaba de aparecer.
        afterNextRender(() => this.suggestionCard()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (error: unknown) => {
        this.announcement.set('');
        this.state.set({
          kind: 'error',
          action,
          message: error instanceof AssistantError ? error.message : 'El asistente no respondió. Inténtalo de nuevo.',
        });
        // El botón pulsado quedó deshabilitado: el foco pasa a «Reintentar».
        afterNextRender(() => this.retryButton()?.nativeElement.focus(), { injector: this.injector });
      },
    });
  }

  protected retry(): void {
    const state = this.state();
    if (state.kind === 'error') {
      this.request(state.action);
    }
  }

  protected async apply(suggestion: Suggestion): Promise<void> {
    switch (suggestion.action) {
      case 'improve':
        this.undoContent.set(this.content());
        this.appliedContent.set(suggestion.content);
        this.applyContent.emit(suggestion.content);
        this.finish(suggestion.action, 'Redacción aplicada.');
        return;
      case 'metadata':
        this.applyMetadata.emit(suggestion.metadata);
        this.finish(suggestion.action, 'Título, extracto y tags aplicados.');
        return;
      case 'cover':
        try {
          await navigator.clipboard.writeText(`${suggestion.cover.description}\n\nAlt: ${suggestion.cover.altText}`);
          this.finish(suggestion.action, 'Idea copiada al portapapeles.');
        } catch {
          // Sin portapapeles (contexto no seguro o permiso denegado), la idea
          // sigue en pantalla y se puede seleccionar.
          this.announcement.set('No se pudo copiar: selecciona el texto y cópialo a mano.');
        }
        return;
    }
  }

  protected discard(): void {
    const suggestion = this.currentSuggestion();
    if (suggestion) {
      this.finish(suggestion.action, 'Sugerencia descartada.');
    }
  }

  protected undo(): void {
    const previous = this.undoContent();
    if (previous !== null) {
      this.applyContent.emit(previous);
      this.undoContent.set(null);
      this.focusAction('improve');
      this.announcement.set('Se restauró el contenido anterior.');
    }
  }

  /** Cierra la sugerencia y devuelve el foco al botón de su acción. */
  private finish(action: AssistantAction, message: string): void {
    this.state.set({ kind: 'idle' });
    this.announcement.set(message);
    this.focusAction(action);
  }

  /** Lleva el foco al botón de una acción cuando el botón que lo tenía desaparece. */
  private focusAction(action: AssistantAction): void {
    afterNextRender(
      () => this.actionButtons().find((button) => button.nativeElement.dataset['action'] === action)?.nativeElement.focus(),
      { injector: this.injector },
    );
  }
}
