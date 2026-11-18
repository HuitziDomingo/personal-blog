// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIslandControls, type IslandControls } from './island-controls';

let canvas: HTMLCanvasElement;
let camera: PerspectiveCamera;
let controls: IslandControls;
const onWheelActiveChange = vi.fn();

/** `prefers-reduced-motion` falso: el test decide si coincide y cuándo cambia. */
function fakeMotionQuery(matches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  return {
    matches,
    addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
    change(next: boolean) {
      this.matches = next;
      listener?.({ matches: next } as MediaQueryListEvent);
    },
  };
}
let motion: ReturnType<typeof fakeMotionQuery>;

function setup(reducedMotion: boolean) {
  controls.dispose();
  motion = fakeMotionQuery(reducedMotion);
  controls = createIslandControls(camera, canvas, { onWheelActiveChange, reducedMotion: motion });
  controls.frame(10, 1);
}

/** Avanza `frames` cuadros de 1/60 s, como el bucle de render. */
function run(frames = 30) {
  for (let index = 0; index < frames; index++) {
    controls.update(1 / 60);
  }
}

function pointer(
  type: string,
  target: EventTarget,
  init: { pointerType?: string; pointerId?: number; button?: number } = {},
) {
  const event = new MouseEvent(type, { bubbles: type !== 'pointerleave', cancelable: true, button: init.button ?? 0 });
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
  // Sin giro automático por defecto: así la cámara solo se mueve por el usuario.
  motion = fakeMotionQuery(true);
  controls = createIslandControls(camera, canvas, { onWheelActiveChange, reducedMotion: motion });
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
    run();

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

  it('un dedo no llega a OrbitControls; dos dedos sí (y paran el giro)', () => {
    setup(false);
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1 });
    expect(controls.autoRotating).toBe(true);

    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 2 });
    expect(controls.autoRotating).toBe(false);
  });
});

describe('createIslandControls: giro automático', () => {
  it('sin reduced-motion, la cámara gira sola', () => {
    setup(false);
    const start = camera.position.clone();
    run();
    expect(controls.autoRotating).toBe(true);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);
  });

  it('con reduced-motion no gira, ni siquiera tras restablecer', () => {
    const start = camera.position.clone();
    run();
    expect(controls.autoRotating).toBe(false);
    expect(camera.position.distanceTo(start)).toBe(0);

    controls.reset();
    expect(controls.autoRotating).toBe(false);
  });

  it('se detiene al arrastrar y no se reanuda al soltar', () => {
    setup(false);
    pointer('pointerdown', canvas);
    pointer('pointerup', document);
    expect(controls.autoRotating).toBe(false);
    // Lo que queda es la inercia del damping, que se apaga.
    run(300);
    const stopped = camera.position.clone();
    run();
    expect(camera.position.distanceTo(stopped)).toBeLessThan(1e-6);
  });

  it('se detiene con la rueda, una vez activa', () => {
    setup(false);
    // Botón central: activa la rueda sin arrastrar (OrbitControls lo ignora
    // porque al pulsarlo `enableZoom` aún era false).
    pointer('pointerdown', canvas, { button: 1 });
    pointer('pointerup', document, { button: 1 });
    expect(controls.autoRotating).toBe(true);

    wheel();
    expect(controls.autoRotating).toBe(false);
  });

  it('se detiene con las flechas, no con Tab ni Escape', () => {
    setup(false);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    expect(controls.autoRotating).toBe(true);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    expect(controls.autoRotating).toBe(false);
  });

  it('se reanuda con «Restablecer vista»', () => {
    setup(false);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    controls.reset();
    expect(controls.autoRotating).toBe(true);
  });

  it('si reduced-motion se activa en caliente, el giro se para y no vuelve', () => {
    setup(false);
    motion.change(true);
    expect(controls.autoRotating).toBe(false);
    controls.reset();
    expect(controls.autoRotating).toBe(false);
  });
});

describe('createIslandControls: reset y teclado', () => {
  it('reset devuelve la cámara al encuadre inicial', () => {
    const start = camera.position.clone();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', shiftKey: true, bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    run();
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);

    controls.reset();
    run();
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
