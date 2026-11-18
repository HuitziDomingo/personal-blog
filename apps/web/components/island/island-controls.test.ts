// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIslandControls, type IslandControls } from './island-controls';

let canvas: HTMLCanvasElement;
let camera: PerspectiveCamera;
let controls: IslandControls;
const onWheelActiveChange = vi.fn();
const onInteractingChange = vi.fn();

function pointer(type: string, target: EventTarget, init: { pointerType?: string; pointerId?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: type !== 'pointerleave', cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  target.dispatchEvent(event);
}

function wheel(): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

function touchMove(fingers: number): Event {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: { length: fingers } });
  canvas.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  // jsdom no implementa la captura de puntero que usa OrbitControls.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  // jsdom no tiene layout: las flechas dividen por el alto del canvas.
  Object.defineProperty(canvas, 'clientWidth', { value: 400 });
  Object.defineProperty(canvas, 'clientHeight', { value: 300 });
  document.body.append(canvas);
  camera = new PerspectiveCamera(30, 4 / 3, 0.1, 100);
  camera.position.set(0, 4, 9);
  onWheelActiveChange.mockClear();
  onInteractingChange.mockClear();
  controls = createIslandControls(camera, canvas, { onWheelActiveChange, onInteractingChange });
  controls.frame(10, 1);
});

afterEach(() => {
  controls.dispose();
  document.body.replaceChildren();
});

describe('createIslandControls: rueda', () => {
  it('sin clic, la rueda no llama a preventDefault ni mueve la cámara', () => {
    const before = camera.position.clone();
    const event = wheel();
    controls.update();

    expect(event.defaultPrevented).toBe(false);
    expect(camera.position.distanceTo(before)).toBe(0);
  });

  it('tras un clic en la isla, la rueda hace zoom; al salir, vuelve a desplazar la página', () => {
    pointer('pointerdown', canvas);
    pointer('pointerup', document);
    expect(onWheelActiveChange).toHaveBeenLastCalledWith(true);
    expect(wheel().defaultPrevented).toBe(true);

    pointer('pointerleave', canvas);
    expect(onWheelActiveChange).toHaveBeenLastCalledWith(false);
    expect(wheel().defaultPrevented).toBe(false);
  });
});

describe('createIslandControls: táctil', () => {
  it('deja un dedo para el scroll vertical de la página', () => {
    expect(canvas.style.touchAction).toBe('pan-y');
    expect(touchMove(1).defaultPrevented).toBe(false);
  });

  it('con dos dedos impide el scroll y OrbitControls gira y hace zoom', () => {
    expect(touchMove(2).defaultPrevented).toBe(true);
  });

  it('un dedo no mueve la cámara; dos dedos sí llegan a OrbitControls', () => {
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1 });
    expect(onInteractingChange).not.toHaveBeenCalled();

    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 2 });
    expect(onInteractingChange).toHaveBeenLastCalledWith(true);
  });
});

describe('createIslandControls: interacción y reset', () => {
  it('avisa cuando el usuario empieza y termina de arrastrar', () => {
    pointer('pointerdown', canvas);
    expect(onInteractingChange).toHaveBeenLastCalledWith(true);
    pointer('pointerup', document);
    expect(onInteractingChange).toHaveBeenLastCalledWith(false);
  });

  it('reset devuelve la cámara al encuadre inicial', () => {
    const start = camera.position.clone();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', shiftKey: true, bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    for (let index = 0; index < 30; index++) {
      controls.update();
    }
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);

    controls.reset();
    for (let index = 0; index < 30; index++) {
      controls.update();
    }
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it('las flechas no desplazan la página con el canvas enfocado', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('dispose deja la rueda y el táctil como estaban', () => {
    controls.dispose();
    expect(canvas.style.touchAction).toBe('');
    pointer('pointerdown', canvas);
    expect(wheel().defaultPrevented).toBe(false);
    expect(touchMove(2).defaultPrevented).toBe(false);
  });
});
