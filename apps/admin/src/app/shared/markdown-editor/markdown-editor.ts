import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { renderMarkdown } from '../../core/markdown/render-markdown';

/**
 * Editor de Markdown de ADR-012: un textarea y la vista previa lado a lado (una
 * debajo de otra en pantallas angostas). La interfaz es solo `value` y
 * `valueChange`, para poder cambiarlo por un editor WYSIWYG sin tocar el
 * formulario que lo usa.
 *
 * La vista previa pasa por `renderMarkdown` (marked + DOMPurify con allowlist)
 * y se enlaza con [innerHTML], que vuelve a sanitizar Angular. Nunca
 * `bypassSecurityTrust*`.
 */
@Component({
  selector: 'app-markdown-editor',
  // Textarea propio y no hlmTextarea: las directivas de brain manejan
  // aria-invalid y aria-describedby desde un hlmField, y aquí los define quien
  // usa el editor.
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-4 md:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2">
        <label class="text-sm font-medium" [for]="inputId()">{{ label() }}</label>
        <textarea
          class="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-96 w-full rounded-md border bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:ring-3 aria-invalid:ring-3"
          [id]="inputId()"
          [value]="value()"
          [attr.aria-invalid]="invalid() || null"
          [attr.aria-describedby]="describedBy() || null"
          (input)="valueChange.emit($any($event.target).value)"
          (blur)="touched.emit()"
        ></textarea>
      </div>

      <section class="flex min-w-0 flex-col gap-2" [attr.aria-labelledby]="inputId() + '-preview'">
        <h2 class="text-sm font-medium" [id]="inputId() + '-preview'">Vista previa</h2>
        <div
          class="preview border-input min-h-96 overflow-auto rounded-md border p-4 text-sm"
          [innerHTML]="html()"
        ></div>
      </section>
    </div>
  `,
  styles: `
    .preview :where(h1, h2, h3, h4, h5, h6) { font-weight: 600; margin: 1em 0 0.5em; }
    .preview h1 { font-size: 1.5rem; }
    .preview h2 { font-size: 1.25rem; }
    .preview h3 { font-size: 1.125rem; }
    .preview :where(p, ul, ol, pre, blockquote, table) { margin: 0 0 0.75em; }
    .preview :where(ul, ol) { padding-left: 1.5em; }
    .preview ul { list-style: disc; }
    .preview ol { list-style: decimal; }
    .preview a { text-decoration: underline; }
    .preview code { font-family: var(--font-mono, monospace); background: var(--muted); padding: 0 0.25em; border-radius: 0.25rem; }
    .preview pre { background: var(--muted); padding: 0.75em; border-radius: 0.375rem; overflow-x: auto; }
    .preview pre code { padding: 0; background: none; }
    .preview blockquote { border-left: 3px solid var(--border); padding-left: 0.75em; color: var(--muted-foreground); }
    .preview img { max-width: 100%; }
    .preview :where(th, td) { border: 1px solid var(--border); padding: 0.25em 0.5em; }
  `,
})
export class MarkdownEditor {
  readonly value = input('');
  readonly valueChange = output<string>();
  /** Se emite al salir del textarea, para marcar el campo como tocado. */
  readonly touched = output<void>();

  readonly inputId = input('markdown-editor');
  readonly label = input('Contenido');
  readonly invalid = input(false);
  readonly describedBy = input<string>();

  protected readonly html = computed(() => renderMarkdown(this.value()));
}
