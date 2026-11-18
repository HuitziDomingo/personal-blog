// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWheelGate, type WheelGate } from './island-wheel-gate';

let canvas: HTMLCanvasElement;
let outside: HTMLButtonElement;
let gate: WheelGate;
const onChange = vi.fn();

function pointer(type: string, target: EventTarget, pointerType = 'mouse') {
  // jsdom no siempre trae PointerEvent: basta un MouseEvent con `pointerType`.
  const event = new MouseEvent(type, { bubbles: type !== 'pointerleave', cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

beforeEach(() => {
  canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  outside = document.createElement('button');
  document.body.append(canvas, outside);
  onChange.mockClear();
  gate = createWheelGate(canvas, onChange);
});

afterEach(() => {
  gate.dispose();
  document.body.replaceChildren();
});

describe('createWheelGate', () => {
  it('empieza inactiva: la rueda desplaza la página', () => {
    expect(gate.active).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('se activa al pulsar sobre el canvas, también en táctil', () => {
    pointer('pointerdown', canvas);
    expect(gate.active).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    pointer('pointerleave', canvas);
    pointer('pointerdown', canvas, 'touch');
    expect(gate.active).toBe(true);
  });

  it('pasar el ratón por encima no la activa', () => {
    pointer('pointerover', canvas);
    pointer('pointermove', canvas);
    expect(gate.active).toBe(false);
  });

  it('se desactiva al salir del canvas', () => {
    pointer('pointerdown', canvas);
    pointer('pointerleave', canvas);
    expect(gate.active).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('se desactiva al pulsar fuera', () => {
    pointer('pointerdown', canvas);
    pointer('pointerdown', outside);
    expect(gate.active).toBe(false);
  });

  it('se desactiva al perder el foco', () => {
    canvas.focus();
    pointer('pointerdown', canvas);
    outside.focus();
    expect(gate.active).toBe(false);
  });

  it('se desactiva con Escape, no con otras teclas', () => {
    pointer('pointerdown', canvas);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(gate.active).toBe(true);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(gate.active).toBe(false);
  });

  it('solo avisa cuando cambia', () => {
    pointer('pointerdown', canvas);
    pointer('pointerdown', canvas);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('dispose quita los listeners', () => {
    gate.dispose();
    pointer('pointerdown', canvas);
    expect(gate.active).toBe(false);
  });
});
