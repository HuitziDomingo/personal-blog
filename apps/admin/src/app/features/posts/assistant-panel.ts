import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { map, Observable, Subscription } from 'rxjs';

import { AssistantError } from '../../core/assistant/fake-writing-assistant';
import { CoverIdea, MetadataSuggestion, WritingAssistant } from '../../core/assistant/writing-assistant';

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

const ACTION_LABELS: Record<AssistantAction, string> = {
  improve: 'Mejorar redacción',
  metadata: 'Sugerir título, extracto y tags',
  cover: 'Idea de imagen de portada',
};

/**
 * Panel «Asistente» del editor: pide sugerencias a WritingAssistant y deja
 * aplicarlas o descartarlas. Nunca cambia el formulario por su cuenta: solo
 * emite lo que el autor aplica.
 */
@Component({
  selector: 'app-assistant-panel',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="assistant-title" class="border-input flex flex-col gap-3 rounded-md border p-4">
      <div class="flex flex-col gap-1">
        <h2 id="assistant-title" class="text-base font-semibold">Asistente</h2>
        <p class="text-muted-foreground text-sm">Sugerencias de ejemplo: todavía no hay ningún modelo conectado.</p>
      </div>

      <div class="flex flex-wrap gap-2">
        @for (action of actions; track action) {
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [disabled]="disabled() || state().kind === 'loading'"
            (click)="request(action)"
          >
            {{ labels[action] }}
          </button>
        }
      </div>

      <div aria-live="polite" class="flex flex-col gap-3">
        @switch (state().kind) {
          @case ('loading') {
            <p class="text-muted-foreground text-sm" role="status">Pensando: {{ labels[loadingAction()!] }}…</p>
          }
          @case ('error') {
            <div role="alert" class="flex flex-wrap items-center gap-3">
              <p class="text-destructive text-sm">{{ errorMessage() }}</p>
              <button hlmBtn variant="outline" size="sm" type="button" (click)="retry()">Reintentar</button>
            </div>
          }
          @case ('ready') {
            @let suggestion = currentSuggestion()!;
            <article aria-label="Sugerencia" class="bg-muted/50 flex flex-col gap-3 rounded-md p-3 text-sm">
              @switch (suggestion.action) {
                @case ('improve') {
                  <h3 class="font-medium">Redacción sugerida</h3>
                  <pre class="font-mono text-xs whitespace-pre-wrap">{{ suggestion.content }}</pre>
                  <p class="text-muted-foreground">Aplicar reemplaza el contenido completo.</p>
                }
                @case ('metadata') {
                  <h3 class="font-medium">Título, extracto y tags</h3>
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
                  <h3 class="font-medium">Idea de portada</h3>
                  <p>{{ suggestion.cover.description }}</p>
                  <p><span class="text-muted-foreground">Texto alternativo:</span> {{ suggestion.cover.altText }}</p>
                  <p class="text-muted-foreground">Es solo una idea: el post todavía no tiene campo de portada. Aplicar la copia al portapapeles.</p>
                }
              }
              <div class="flex gap-2">
                <button hlmBtn size="sm" type="button" (click)="apply(suggestion)">Aplicar</button>
                <button hlmBtn variant="ghost" size="sm" type="button" (click)="discard()">Descartar</button>
              </div>
            </article>
          }
        }
      </div>
    </section>
  `,
})
export class AssistantPanel {
  private readonly assistant = inject(WritingAssistant);
  private readonly destroyRef = inject(DestroyRef);

  readonly title = input('');
  readonly content = input('');
  readonly disabled = input(false);

  /** El autor aplicó una redacción: reemplaza el contenido. */
  readonly applyContent = output<string>();
  /** El autor aplicó título, extracto y tags. */
  readonly applyMetadata = output<MetadataSuggestion>();

  protected readonly actions: AssistantAction[] = ['improve', 'metadata', 'cover'];
  protected readonly labels = ACTION_LABELS;
  protected readonly state = signal<PanelState>({ kind: 'idle' });

  private request$?: Subscription;

  protected loadingAction(): AssistantAction | null {
    const state = this.state();
    return state.kind === 'loading' ? state.action : null;
  }

  protected errorMessage(): string {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  }

  protected currentSuggestion(): Suggestion | null {
    const state = this.state();
    return state.kind === 'ready' ? state.suggestion : null;
  }

  protected request(action: AssistantAction): void {
    this.request$?.unsubscribe();
    this.state.set({ kind: 'loading', action });

    const draft = { title: this.title(), content: this.content() };
    const suggestion$: Observable<Suggestion> =
      action === 'improve'
        ? this.assistant.improveWriting(draft).pipe(map((content) => ({ action: 'improve' as const, content })))
        : action === 'metadata'
          ? this.assistant.suggestMetadata(draft).pipe(map((metadata) => ({ action: 'metadata' as const, metadata })))
          : this.assistant.suggestCover(draft).pipe(map((cover) => ({ action: 'cover' as const, cover })));

    this.request$ = suggestion$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (suggestion) => this.state.set({ kind: 'ready', suggestion }),
      error: (error: unknown) =>
        this.state.set({
          kind: 'error',
          action,
          message: error instanceof AssistantError ? error.message : 'El asistente no respondió. Inténtalo de nuevo.',
        }),
    });
  }

  protected retry(): void {
    const state = this.state();
    if (state.kind === 'error') {
      this.request(state.action);
    }
  }

  protected apply(suggestion: Suggestion): void {
    switch (suggestion.action) {
      case 'improve':
        this.applyContent.emit(suggestion.content);
        break;
      case 'metadata':
        this.applyMetadata.emit(suggestion.metadata);
        break;
      case 'cover':
        void navigator.clipboard?.writeText(`${suggestion.cover.description}\n\nAlt: ${suggestion.cover.altText}`);
        break;
    }
    this.state.set({ kind: 'idle' });
  }

  protected discard(): void {
    this.state.set({ kind: 'idle' });
  }
}
