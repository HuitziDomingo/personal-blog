import { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose, replaceAll } from '@milkdown/kit/utils';

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
  /** Se llama en cada cambio del documento hecho en el editor, sin espera. */
  readonly onChange: (markdown: string) => void;
}

export interface MilkdownHandle {
  /** El elemento editable (contenteditable) de ProseMirror. */
  readonly dom: HTMLElement;
  /** Reemplaza el contenido sin llamar a `onChange`. */
  setMarkdown(markdown: string): void;
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
  // Mientras se aplica un valor que viene de fuera no se avisa: no es una
  // edición, y avisar marcaría el formulario como modificado al cargar.
  let applyingExternal = false;
  // Último Markdown conocido. Hay transacciones que cambian el documento pero
  // no el Markdown (el plugin trailing agrega un párrafo vacío al final): esas
  // no se avisan.
  let last = '';

  // El listener de Milkdown (`markdownUpdated`) avisa con 200 ms de debounce: un
  // guardado justo después de teclear perdería la última tecla. Este plugin
  // serializa y avisa en cada transacción que cambia el documento.
  const emitChanges = $prose(
    (ctx) =>
      new Plugin({
        view: () => ({
          update: (view, previous) => {
            if (view.state.doc.eq(previous.doc)) {
              return;
            }
            const markdown = ctx.get(serializerCtx)(view.state.doc);
            if (applyingExternal || markdown === last) {
              last = markdown;
              return;
            }
            last = markdown;
            onChange(markdown);
          },
        }),
      }),
  );

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
    })
    .use(emitChanges);

  await crepe.create();
  crepe.setReadonly(readonly);
  last = crepe.getMarkdown();

  return {
    dom: crepe.editor.ctx.get(editorViewCtx).dom,
    setMarkdown(value) {
      applyingExternal = true;
      try {
        crepe.editor.action(replaceAll(value));
      } finally {
        applyingExternal = false;
      }
    },
    getMarkdown: () => crepe.getMarkdown(),
    setReadonly(value) {
      crepe.setReadonly(value);
    },
    destroy: async () => {
      await crepe.destroy();
    },
  };
}
