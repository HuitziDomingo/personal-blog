// Apoyo para los tests del editor con Milkdown real en jsdom. Solo lo importan
// los .spec.ts, así que no llega al bundle. Sin `vi`: el build de la app
// también compila este archivo, y ahí no hay tipos de Vitest.

/**
 * jsdom no tiene IntersectionObserver ni ResizeObserver, y el bloque de
 * código de Milkdown los usa al crearse. Fake mínimo (ADR-015): en jsdom no
 * hay layout que observar.
 */
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

/**
 * jsdom tampoco tiene ClipboardEvent ni DragEvent, y el plugin de subida de
 * Milkdown comprueba `instanceof` con los dos antes de mirar los archivos.
 */
class FakeClipboardEvent extends Event {}
class FakeDragEvent extends Event {}

/** Lo que Milkdown y ProseMirror leen del portapapeles. */
interface FakeClipboard {
  readonly text?: string;
  readonly files?: File[];
}

/**
 * Completa las APIs del navegador que le faltan a jsdom y que Milkdown usa.
 * Solo agrega las que faltan, así que no hay nada que restaurar.
 */
export function installMissingBrowserApis(): void {
  const missing = { IntersectionObserver: NoopObserver, ResizeObserver: NoopObserver, ClipboardEvent: FakeClipboardEvent, DragEvent: FakeDragEvent };
  for (const [name, implementation] of Object.entries(missing)) {
    if (!(name in globalThis)) {
      Object.defineProperty(globalThis, name, { value: implementation, configurable: true, writable: true });
    }
  }
  // ProseMirror mide la selección al enfocar para hacer scroll; jsdom no tiene
  // layout y Range no trae estos métodos.
  if (!('getClientRects' in Range.prototype)) {
    Object.assign(Range.prototype, {
      getClientRects: () => [],
      getBoundingClientRect: () => new DOMRect(),
    });
  }
}

/**
 * Pega en el editor. jsdom no simula teclear en un contenteditable, pero
 * ProseMirror procesa el evento paste como una entrada del usuario: el texto
 * pasa por el plugin de portapapeles de Milkdown, que lo interpreta como
 * Markdown, y por una transacción normal. Requiere installMissingBrowserApis().
 */
export function paste(editable: HTMLElement, { text = '', files = [] }: FakeClipboard): void {
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      types: files.length > 0 ? ['Files'] : ['text/plain'],
      // Con la forma de un FileList: el uploader de Milkdown usa item(i).
      files: Object.assign([...files], { item: (index: number) => files[index] ?? null }),
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
  editable.dispatchEvent(event);
}
