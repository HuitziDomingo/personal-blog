/**
 * Acciones de la barra de herramientas del editor (BLOG-108). Vive aparte de
 * milkdown.ts para que MarkdownEditor las use sin importar Milkdown, que se
 * carga con `import()` (ADR-018, punto 4).
 */
export const FORMAT_ACTIONS = [
  'heading1',
  'heading2',
  'heading3',
  'bold',
  'italic',
  'inlineCode',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'link',
] as const;

export type FormatAction = (typeof FORMAT_ACTIONS)[number];

/** Qué acciones están aplicadas donde está el cursor o la selección. */
export type FormatState = Readonly<Record<FormatAction, boolean>>;

export const NO_FORMAT: FormatState = Object.fromEntries(FORMAT_ACTIONS.map((action) => [action, false])) as Record<
  FormatAction,
  boolean
>;

export function sameFormat(a: FormatState, b: FormatState): boolean {
  return FORMAT_ACTIONS.every((action) => a[action] === b[action]);
}
