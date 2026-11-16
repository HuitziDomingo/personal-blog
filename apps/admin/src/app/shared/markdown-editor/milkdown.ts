import { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  liftListItemCommand,
  linkSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';
import { lift } from '@milkdown/kit/prose/commands';
import type { MarkType } from '@milkdown/kit/prose/model';
import { AllSelection, Plugin, Selection, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose, replaceAll } from '@milkdown/kit/utils';

import { NO_FORMAT, sameFormat, type FormatAction, type FormatState } from './editor-format';

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
 * - TopBar: la barra fija es la de MarkdownEditor (BLOG-108), que usa
 *   `format` y `onFormatChange`. La de Crepe solo responde a `pointerdown`
 *   (no se puede usar con el teclado), sus botones no tienen nombre accesible
 *   ni la barra el rol toolbar, y siempre trae la lista de tareas, que la
 *   allowlist no publica.
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
  /**
   * Se llama con el formato del cursor o la selección cuando cambia, y una vez
   * al crearse. Lo usa la barra de herramientas para marcar sus botones.
   */
  readonly onFormatChange?: (format: FormatState) => void;
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
  /**
   * Aplica una acción de la barra de herramientas a la selección. Las que ya
   * están aplicadas se quitan (salvo el link, que abre su edición).
   */
  format(action: FormatAction): void;
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

export async function createMilkdown({ root, markdown, readonly, onChange, onFormatChange }: MilkdownOptions): Promise<MilkdownHandle> {
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
  // Avisa el formato cuando cambia: el plugin ve cada transacción, también
  // las que solo mueven el cursor.
  let lastFormat = NO_FORMAT;
  const emitFormat = (ctx: Ctx, state: EditorState) => {
    const format = formatOf(ctx, state);
    if (!sameFormat(format, lastFormat)) {
      lastFormat = format;
      onFormatChange?.(format);
    }
  };
  crepe.editor.use($prose((ctx) => new Plugin({ view: () => ({ update: (view) => emitFormat(ctx, view.state) }) })));

  // Serializar el documento entero en cada tecla es caro en posts largos: se
  // usa el debounce del listener de Milkdown, y `flush` cubre el guardado.
  crepe.on((listener) => listener.markdownUpdated((_, value) => emit(value)));

  await crepe.create();
  crepe.setReadonly(readonly);
  last = crepe.getMarkdown();
  crepe.editor.action((ctx) => {
    lastFormat = formatOf(ctx, ctx.get(editorViewCtx).state);
    onFormatChange?.(lastFormat);
  });

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
    format(action) {
      crepe.editor.action((ctx) => applyFormat(ctx, action));
    },
    destroy: async () => {
      await crepe.destroy();
    },
  };
}

/** Si la marca está en toda la selección, o en el cursor (y lo que se teclee). */
function hasMark(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
  }
  return state.doc.rangeHasMark(from, to, type);
}

/** Profundidad de la lista más cercana que contiene el cursor, o -1. */
function listDepth(ctx: Ctx, state: EditorState): number {
  const { $from } = state.selection;
  const lists = [bulletListSchema.type(ctx), orderedListSchema.type(ctx)];
  for (let depth = $from.depth; depth > 0; depth--) {
    if (lists.includes($from.node(depth).type)) {
      return depth;
    }
  }
  return -1;
}

/** Profundidad de la cita más cercana que contiene el cursor, o -1. */
function blockquoteDepth(ctx: Ctx, state: EditorState): number {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === blockquoteSchema.type(ctx)) {
      return depth;
    }
  }
  return -1;
}

/**
 * Recorta la selección para que no pase del nodo (lista o cita) que contiene
 * su inicio, a esa profundidad. Sacar bloques de un nodo falla si la
 * selección sigue fuera de él, por ejemplo con todo seleccionado.
 */
function selectWithin(view: EditorView, depth: number): void {
  const { selection, doc } = view.state;
  const end = selection.$from.end(depth);
  if (depth <= 0 || selection.to <= end) {
    return;
  }
  const $end = Selection.findFrom(doc.resolve(end), -1, true)?.$to ?? selection.$from;
  view.dispatch(view.state.tr.setSelection(TextSelection.between(selection.$from, $end)));
}

function formatOf(ctx: Ctx, state: EditorState): FormatState {
  const { $from } = state.selection;
  const parent = $from.parent;
  const level = parent.type === headingSchema.type(ctx) ? (parent.attrs['level'] as number) : 0;
  const depth = listDepth(ctx, state);
  const list = depth > 0 ? $from.node(depth).type : undefined;
  const blockquote = blockquoteDepth(ctx, state) > 0;

  return {
    heading2: level === 2,
    heading3: level === 3,
    heading4: level === 4,
    bold: hasMark(state, strongSchema.type(ctx)),
    italic: hasMark(state, emphasisSchema.type(ctx)),
    inlineCode: hasMark(state, inlineCodeSchema.type(ctx)),
    bulletList: list === bulletListSchema.type(ctx),
    orderedList: list === orderedListSchema.type(ctx),
    blockquote,
    codeBlock: parent.type === codeBlockSchema.type(ctx),
    link: hasMark(state, linkSchema.type(ctx)),
  };
}

function applyFormat(ctx: Ctx, action: FormatAction): void {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);
  // Con todo seleccionado (Ctrl+A), la selección empieza fuera de los bloques
  // y ni sacar de la lista ni de la cita encuentran qué mover. Se cambia por
  // la misma selección de texto, del primer carácter al último.
  if (view.state.selection instanceof AllSelection) {
    const { doc } = view.state;
    view.dispatch(view.state.tr.setSelection(TextSelection.between(Selection.atStart(doc).$from, Selection.atEnd(doc).$to)));
  }
  const active = formatOf(ctx, view.state)[action];
  const setBlock = (nodeType = paragraphSchema.type(ctx), attrs?: Record<string, unknown>) =>
    commands.call(setBlockTypeCommand.key, { nodeType, attrs });

  switch (action) {
    case 'heading2':
    case 'heading3':
    case 'heading4':
      if (active) {
        setBlock();
      } else {
        setBlock(headingSchema.type(ctx), { level: Number(action.slice(-1)) });
      }
      return;
    case 'bold':
      commands.call(toggleStrongCommand.key);
      return;
    case 'italic':
      commands.call(toggleEmphasisCommand.key);
      return;
    case 'inlineCode': {
      // toggleInlineCodeCommand no hace nada sin selección: como en el TopBar
      // de Crepe, la marca queda guardada para lo que se teclee.
      const { state } = view;
      if (state.selection.empty) {
        const type = inlineCodeSchema.type(ctx);
        view.dispatch(active ? state.tr.removeStoredMark(type) : state.tr.addStoredMark(type.create()));
      } else {
        commands.call(toggleInlineCodeCommand.key);
      }
      return;
    }
    case 'bulletList':
    case 'orderedList': {
      const type = (action === 'bulletList' ? bulletListSchema : orderedListSchema).type(ctx);
      const depth = listDepth(ctx, view.state);
      if (active) {
        // Ya es de este tipo: los elementos salen de la lista.
        selectWithin(view, depth);
        commands.call(liftListItemCommand.key);
      } else if (depth > 0) {
        // Es de la otra: cambia el tipo de la lista entera.
        view.dispatch(view.state.tr.setNodeMarkup(view.state.selection.$from.before(depth), type));
      } else {
        commands.call(wrapInBlockTypeCommand.key, { nodeType: type });
      }
      return;
    }
    case 'blockquote':
      if (active) {
        selectWithin(view, blockquoteDepth(ctx, view.state));
        lift(view.state, view.dispatch);
      } else {
        commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) });
      }
      return;
    case 'codeBlock':
      setBlock(active ? paragraphSchema.type(ctx) : codeBlockSchema.type(ctx));
      return;
    case 'link':
      // Con un link, lo quita; sin él, abre la edición del link-tooltip de
      // Crepe (el mismo de la barra flotante), que limpia la URL al confirmar.
      commands.call(toggleLinkCommand.key);
      return;
  }
}
