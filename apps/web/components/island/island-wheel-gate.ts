/**
 * Cuándo la rueda del ratón hace zoom en la isla (BLOG-118).
 *
 * Por defecto la rueda desplaza la página: la isla no la «secuestra». Se activa
 * al pulsar sobre el canvas y se desactiva al salir de él (`pointerleave`), al
 * pulsar fuera, al perder el foco o con Escape. Este módulo no importa three:
 * solo escucha eventos del DOM y avisa con `onChange`, así que se prueba con
 * jsdom.
 */
export interface WheelGate {
  /** Si la rueda hace zoom ahora mismo. */
  readonly active: boolean;
  /** Quita los listeners. */
  dispose: () => void;
}

export function createWheelGate(target: HTMLElement, onChange: (active: boolean) => void): WheelGate {
  let active = false;
  const set = (next: boolean) => {
    if (next !== active) {
      active = next;
      onChange(next);
    }
  };
  const activate = () => {
    set(true);
  };
  const deactivate = () => {
    set(false);
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Node) || !target.contains(event.target)) {
      set(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      set(false);
    }
  };

  const document = target.ownerDocument;
  target.addEventListener('pointerdown', activate);
  target.addEventListener('pointerleave', deactivate);
  target.addEventListener('blur', deactivate);
  target.addEventListener('keydown', onKeyDown);
  // En captura: un `stopPropagation` de otro componente no lo esconde.
  document.addEventListener('pointerdown', onDocumentPointerDown, true);

  return {
    get active() {
      return active;
    },
    dispose: () => {
      target.removeEventListener('pointerdown', activate);
      target.removeEventListener('pointerleave', deactivate);
      target.removeEventListener('blur', deactivate);
      target.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    },
  };
}
