import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBold,
  lucideCode,
  lucideEye,
  lucideHeading1,
  lucideHeading2,
  lucideHeading3,
  lucideItalic,
  lucideLink,
  lucideList,
  lucideListOrdered,
  lucideQuote,
  lucideSquareCode,
} from '@ng-icons/lucide';
import { renderMarkdown } from '@personal-blog/markdown';
import { buttonVariants } from '@spartan-ng/helm/button';

import { NO_FORMAT, type FormatAction, type FormatState } from './editor-format';
import type { MilkdownHandle } from './milkdown';
import { MILKDOWN_THEME_LOADER } from './milkdown-theme';

/**
 * Espera de la vista previa tras la última tecla. Convertir y sanitizar el
 * Markdown entero en cada tecla es caro en posts largos; el valor del
 * formulario no espera nunca.
 */
export const PREVIEW_DEBOUNCE_MS = 150;

type EditorState = 'loading' | 'ready' | 'error';

interface ToolbarButton {
  readonly action: FormatAction;
  readonly label: string;
  readonly icon: string;
}

/** Botones de la barra de herramientas, por grupos (BLOG-108). */
const TOOLBAR_GROUPS: readonly (readonly ToolbarButton[])[] = [
  [
    { action: 'heading1', label: 'Título 1', icon: 'lucideHeading1' },
    { action: 'heading2', label: 'Título 2', icon: 'lucideHeading2' },
    { action: 'heading3', label: 'Título 3', icon: 'lucideHeading3' },
  ],
  [
    { action: 'bold', label: 'Negritas', icon: 'lucideBold' },
    { action: 'italic', label: 'Cursivas', icon: 'lucideItalic' },
    { action: 'inlineCode', label: 'Código', icon: 'lucideCode' },
  ],
  [
    { action: 'bulletList', label: 'Lista con viñetas', icon: 'lucideList' },
    { action: 'orderedList', label: 'Lista numerada', icon: 'lucideListOrdered' },
  ],
  [
    { action: 'blockquote', label: 'Cita', icon: 'lucideQuote' },
    { action: 'codeBlock', label: 'Bloque de código', icon: 'lucideSquareCode' },
    { action: 'link', label: 'Link', icon: 'lucideLink' },
  ],
];

/**
 * Editor de Markdown de ADR-018: Milkdown Crepe y la vista previa lado a lado
 * (una debajo de otra en pantallas angostas). La interfaz sigue siendo `value`
 * y `valueChange` (ADR-012), así que el formulario no cambia.
 *
 * - Entra y sale Markdown; el editor nunca entrega HTML (ADR-018, punto 2).
 * - Milkdown se carga con `import()` al montar el editor, en su propio chunk
 *   (ADR-018, punto 4), y su tema con un <link> a una hoja aparte
 *   (milkdown-theme.css). Mientras cargan se muestra un aviso.
 * - `valueChange` llega con el debounce de Milkdown (200 ms), no en cada
 *   tecla. Quien guarda llama antes a `flush()`, que emite ya lo pendiente.
 * - La vista previa pasa por `renderMarkdown` (marked + DOMPurify con
 *   allowlist), igual que la web, y se enlaza con [innerHTML], que vuelve a
 *   sanitizar Angular. Es la verdad de cómo se publicará el post (ADR-018,
 *   punto 3). Se recalcula PREVIEW_DEBOUNCE_MS después de la última tecla; el
 *   primer valor se muestra de inmediato.
 *
 * - La barra de herramientas fija (BLOG-108) sigue el patrón toolbar de
 *   WAI-ARIA: un solo botón en el orden de tabulación, las flechas, Inicio y
 *   Fin se mueven entre ellos, y Escape vuelve al texto. Los botones con
 *   aria-pressed dicen si el formato está aplicado donde está el cursor. Con el
 *   mouse no le quitan el foco al editor, así que la selección sigue visible.
 *
 * Sin encapsulación: la vista previa se llena con [innerHTML] y los estilos
 * encapsulados no le llegarían. Todas las reglas van bajo `app-markdown-editor`.
 */
@Component({
  selector: 'app-markdown-editor',
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideBold,
      lucideCode,
      lucideEye,
      lucideHeading1,
      lucideHeading2,
      lucideHeading3,
      lucideItalic,
      lucideLink,
      lucideList,
      lucideListOrdered,
      lucideQuote,
      lucideSquareCode,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './markdown-editor.css',
  template: `
    <div class="grid gap-4 md:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2">
        <!-- Un contenteditable no es «labelable»: el nombre le llega por
             aria-labelledby. -->
        <span class="text-sm font-medium" [id]="labelId()">{{ label() }}</span>
        <!-- Sin role="status" en el aviso de carga: la página ya tiene uno
             para «Borrador guardado.», y serían dos. -->
        <div
          class="editor-frame border-input min-h-96 rounded-md border"
          [class.editor-invalid]="invalid()"
          [class.editor-disabled]="disabled()"
          [attr.aria-busy]="state() === 'loading' || null"
          (focusout)="onFocusOut($event)"
        >
          <div
            #toolbar
            class="editor-toolbar"
            role="toolbar"
            aria-label="Formato"
            [attr.aria-controls]="inputId()"
          >
            @for (group of groups; track $index; let last = $last) {
              @for (button of group; track button.action) {
                <!-- Sin hlmBtn: BrnButton fija su propio tabindex, y la barra
                     necesita el suyo. Mismas clases y data-slot (44 px con
                     el dedo, styles.css). -->
                <button
                  type="button"
                  data-slot="button"
                  [class]="buttonClass"
                  [attr.aria-label]="button.label"
                  [attr.title]="button.label"
                  [attr.aria-pressed]="format()[button.action]"
                  [attr.tabindex]="button.action === focusable() ? 0 : -1"
                  [disabled]="toolbarDisabled()"
                  [attr.data-disabled]="toolbarDisabled() || null"
                  (click)="apply(button.action)"
                  (mousedown)="$event.preventDefault()"
                  (focus)="focusable.set(button.action)"
                  (keydown)="onToolbarKeydown($event)"
                >
                  <ng-icon [name]="button.icon" aria-hidden="true" />
                </button>
              }
              @if (!last) {
                <div class="editor-toolbar-separator" role="separator" aria-orientation="vertical"></div>
              }
            }
          </div>
          <div #root></div>
          @switch (state()) {
            @case ('loading') {
              <p class="text-muted-foreground px-3 py-2 text-sm">Cargando el editor…</p>
            }
            @case ('error') {
              <p class="text-destructive px-3 py-2 text-sm" role="alert">No se pudo cargar el editor. Recarga la página.</p>
            }
          }
        </div>
      </div>

      <section class="flex min-w-0 flex-col gap-2" [attr.aria-labelledby]="inputId() + '-preview'">
        <h2 class="flex items-center gap-2 text-sm font-medium" [id]="inputId() + '-preview'">
          <ng-icon name="lucideEye" size="1rem" aria-hidden="true" />Vista previa
        </h2>
        <div
          class="preview markdown-body min-h-96 overflow-auto rounded-lg border p-4 text-sm"
          [innerHTML]="html()"
        ></div>
      </section>
    </div>
  `,
})
export class MarkdownEditor {
  readonly value = input('');
  readonly valueChange = output<string>();
  /** Se emite al salir del editor, para marcar el campo como tocado. */
  readonly touched = output<void>();

  readonly inputId = input('markdown-editor');
  readonly label = input('Contenido');
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly describedBy = input<string>();

  protected readonly labelId = computed(() => `${this.inputId()}-label`);
  protected readonly state = signal<EditorState>('loading');

  protected readonly groups = TOOLBAR_GROUPS;
  protected readonly buttonClass = `${buttonVariants({ variant: 'ghost', size: 'icon-sm' })} editor-toolbar-button`;
  /** Formato donde está el cursor, para el aria-pressed de los botones. */
  protected readonly format = signal<FormatState>(NO_FORMAT);
  /** El botón de la barra que entra en el orden de tabulación. */
  protected readonly focusable = signal<FormatAction>('heading1');
  protected readonly toolbarDisabled = computed(() => this.state() !== 'ready' || this.disabled());

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly toolbar = viewChild.required<ElementRef<HTMLElement>>('toolbar');
  private readonly theme = inject(MILKDOWN_THEME_LOADER);
  private readonly editor = signal<MilkdownHandle | undefined>(undefined);
  /**
   * Último Markdown que el editor tiene: el que emitió o el que se le aplicó.
   * Cuando `value` vuelve con ese mismo texto (el formulario devuelve lo que el
   * editor emitió) no se reaplica, para no mover el cursor.
   */
  private current = '';

  /** Texto que muestra la vista previa: `value` con el debounce aplicado. */
  private readonly previewSource = signal<string | undefined>(undefined);
  protected readonly html = computed(() => renderMarkdown(this.previewSource() ?? ''));

  constructor() {
    effect((onCleanup) => {
      const value = this.value();

      // El primer valor (el contenido inicial) no espera.
      if (untracked(this.previewSource) === undefined) {
        this.previewSource.set(value);
        return;
      }

      // Cada tecla reprograma el timer: solo se renderiza el último valor.
      const timer = setTimeout(() => this.previewSource.set(value), PREVIEW_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // Un valor que llega de fuera (por ejemplo, el post cargado de la API).
    effect(() => {
      const editor = this.editor();
      const value = this.value();
      if (editor && value !== this.current) {
        this.current = value;
        editor.setMarkdown(value);
      }
    });

    effect(() => this.editor()?.setReadonly(this.disabled()));

    // Atributos de accesibilidad del área editable. ProseMirror solo maneja los
    // suyos (class, contenteditable, translate), así que estos se conservan.
    effect(() => {
      const dom = this.editor()?.dom;
      if (!dom) {
        return;
      }
      setAttributes(dom, {
        id: this.inputId(),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': this.labelId(),
        'aria-describedby': this.describedBy() || null,
        'aria-invalid': this.invalid() ? 'true' : null,
        'aria-disabled': this.disabled() ? 'true' : null,
      });
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => void this.load(destroyRef));
  }

  /**
   * Emite ya, por `valueChange`, el cambio que el debounce de Milkdown todavía
   * no avisó. Es síncrono: al volver, el formulario tiene el último contenido.
   */
  flush(): void {
    this.editor()?.flush();
  }

  protected apply(action: FormatAction): void {
    this.editor()?.format(action);
  }

  protected onToolbarKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.editor()?.dom.focus();
      return;
    }
    const buttons = [...this.toolbar().nativeElement.querySelectorAll<HTMLButtonElement>('button')];
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const last = buttons.length - 1;
    const next: Partial<Record<string, number>> = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    const index = next[event.key];
    if (current < 0 || index === undefined) {
      return;
    }
    event.preventDefault();
    buttons[index]?.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const frame = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node && frame.contains(event.relatedTarget))) {
      this.touched.emit();
    }
  }

  private async load(destroyRef: DestroyRef): Promise<void> {
    let destroyed = false;
    destroyRef.onDestroy(() => {
      destroyed = true;
      void this.editor()?.destroy();
    });

    try {
      const [{ createMilkdown }] = await Promise.all([import('./milkdown'), this.theme.load()]);
      if (destroyed) {
        return;
      }
      this.current = untracked(this.value);
      const editor = await createMilkdown({
        root: this.root().nativeElement,
        markdown: this.current,
        readonly: untracked(this.disabled),
        onChange: (markdown) => {
          this.current = markdown;
          this.valueChange.emit(markdown);
        },
        onFormatChange: (format) => this.format.set(format),
      });
      // Si el componente se destruyó mientras se creaba, el editor no llegó a
      // la señal y nadie más lo destruiría.
      if (destroyed) {
        await editor.destroy();
        return;
      }
      this.editor.set(editor);
      this.state.set('ready');
    } catch (error) {
      console.error('No se pudo cargar el editor', error);
      this.state.set('error');
    }
  }
}

function setAttributes(element: HTMLElement, attributes: Record<string, string | null>): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }
}
