import { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { editorViewCtx } from '@milkdown/kit/core';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { replaceAll } from '@milkdown/kit/utils';

/**
 * Este módulo es el único que importa Milkdown, y el editor lo carga con
 * `import()`: Milkdown, ProseMirror, CodeMirror y Vue van en un chunk aparte
 * que solo se descarga al abrir el editor (ADR-018, punto 4).
 *
 * Se arma con `CrepeBuilder` y solo las funciones permitidas, en lugar de
 * `Crepe`: el punto de entrada de `Crepe` importa todas de forma estática, así
 * que KaTeX, la función de IA y el bloque de imágenes acabarían en el bundle
 * aunque estuvieran desactivadas (ADR-018, punto 6). Quedan fuera:
 * - Latex: KaTeX y las fórmulas están fuera de la allowlist de
 *   `packages/markdown`.
 * - ImageBlock: sin backend de subida, insertaría URLs `blob:` que `isSafeUrl`
 *   descarta. Las imágenes se siguen escribiendo como `![alt](https://…)`.
 * - AI: manda el contenido a un proveedor externo.
 * - TopBar: duplica la barra flotante.
 */

export interface MilkdownOptions {
  readonly root: HTMLElement;
  readonly markdown: string;
  readonly readonly: boolean;
  /**
   * Se llama con el Markdown nuevo cuando el editor lo cambió: con el debounce
   * de Milkdown (200 ms después del último cambio) o al llamar a `flush`.
   */
  readonly onChange: (markdown: string) => void;
}

export interface MilkdownHandle {
  /** El elemento editable (contenteditable) de ProseMirror. */
  readonly dom: HTMLElement;
  /** Reemplaza el contenido sin llamar a `onChange`. */
  setMarkdown(markdown: string): void;
  /**
   * Serializa ya, sin esperar el debounce, y llama a `onChange` si hay un
   * cambio que todavía no se avisó. Se usa antes de guardar.
   */
  flush(): void;
  getMarkdown(): string;
  setReadonly(readonly: boolean): void;
  destroy(): Promise<void>;
}

// Textos del menú «/» en español. `null` quita la opción.
const BLOCK_EDIT_CONFIG = {
  textGroup: {
    label: 'Texto',
    text: { label: 'Párrafo' },
    h1: { label: 'Título 1' },
    h2: { label: 'Título 2' },
    h3: { label: 'Título 3' },
    h4: { label: 'Título 4' },
    h5: { label: 'Título 5' },
    h6: { label: 'Título 6' },
    quote: { label: 'Cita' },
    divider: { label: 'Separador' },
  },
  listGroup: {
    label: 'Listas',
    bulletList: { label: 'Lista con viñetas' },
    orderedList: { label: 'Lista numerada' },
    // La allowlist no tiene <input>: la casilla se perdería al publicar.
    taskList: null,
  },
  advancedGroup: {
    label: 'Avanzado',
    image: null,
    codeBlock: { label: 'Bloque de código' },
    table: { label: 'Tabla' },
    math: null,
  },
};

export async function createMilkdown({ root, markdown, readonly, onChange }: MilkdownOptions): Promise<MilkdownHandle> {
  // Último Markdown avisado o aplicado desde fuera. Solo se avisa lo que
  // difiere: así no se avisa un valor externo (marcaría el formulario como
  // modificado al cargar), ni dos veces el mismo cambio (el debounce y
  // `flush`), ni una transacción que no cambia el Markdown (el plugin trailing
  // agrega un párrafo vacío al final).
  let last = '';
  const emit = (value: string) => {
    if (value !== last) {
      last = value;
      onChange(value);
    }
  };

  const crepe = new CrepeBuilder({ root, defaultValue: markdown })
    .addFeature(cursor)
    .addFeature(listItem)
    .addFeature(linkTooltip, {
      inputPlaceholder: 'Pega o escribe un link…',
    })
    .addFeature(blockEdit, BLOCK_EDIT_CONFIG)
    .addFeature(placeholder, { text: 'Escribe, o usa «/» para insertar un bloque…', mode: 'doc' })
    .addFeature(toolbar, {
      boldLabel: 'Negritas',
      italicLabel: 'Cursivas',
      strikethroughLabel: 'Tachado',
      codeLabel: 'Código',
      linkLabel: 'Link',
    })
    .addFeature(codeMirror)
    .addFeature(table);

  crepe.editor
    .config((ctx) => {
      // CrepeBuilder convierte en <img src="blob:…"> las imágenes que se pegan
      // o se arrastran. Sin subida no hay URL que guardar: se ignoran.
      ctx.update(uploadConfig.key, (previous) => ({ ...previous, uploader: () => Promise.resolve([]) }));
    });
  // Serializar el documento entero en cada tecla es caro en posts largos: se
  // usa el debounce del listener de Milkdown, y `flush` cubre el guardado.
  crepe.on((listener) => listener.markdownUpdated((_, value) => emit(value)));

  await crepe.create();
  crepe.setReadonly(readonly);
  last = crepe.getMarkdown();

  return {
    dom: crepe.editor.ctx.get(editorViewCtx).dom,
    setMarkdown(value) {
      crepe.editor.action(replaceAll(value));
      // El debounce pendiente serializará esto mismo y no avisará.
      last = crepe.getMarkdown();
    },
    flush: () => emit(crepe.getMarkdown()),
    getMarkdown: () => crepe.getMarkdown(),
    setReadonly(value) {
      crepe.setReadonly(value);
    },
    destroy: async () => {
      await crepe.destroy();
    },
  };
}
