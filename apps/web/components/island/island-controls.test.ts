// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIslandControls, easeOutCirc, INTRO_DURATION, introAngle, type IslandControls } from './island-controls';

let canvas: HTMLCanvasElement;
let camera: PerspectiveCamera;
let controls: IslandControls;

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
  controls = createIslandControls(camera, canvas, { reducedMotion: motion });
  controls.frame(10, 1, 3);
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
  // Sin giro automático por defecto: así la cámara solo se mueve por el usuario.
  motion = fakeMotionQuery(true);
  controls = createIslandControls(camera, canvas, { reducedMotion: motion });
  controls.frame(10, 1, 3);
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
    expect(wheel().defaultPrevented).toBe(true);

    pointer('pointerleave', canvas);
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

  it('se reanuda al restablecer', () => {
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

describe('introAngle', () => {
  it('empieza en dos vueltas enteras (la vista de la imagen fija) y llega a 0 en 1.5 s', () => {
    expect(INTRO_DURATION).toBe(1.5);
    expect(introAngle(0)).toBeCloseTo(4 * Math.PI);
    expect(introAngle(INTRO_DURATION)).toBe(0);
    expect(introAngle(10)).toBe(0);
  });

  it('frena: cada tramo igual de tiempo gira menos que el anterior', () => {
    const steps = Array.from({ length: 16 }, (_, index) => introAngle((index / 15) * INTRO_DURATION));
    const turned = steps.slice(1).map((angle, index) => (steps[index] ?? 0) - angle);
    for (let index = 1; index < turned.length; index++) {
      expect(turned[index]).toBeLessThan(turned[index - 1] ?? 0);
    }
  });

  it('usa la curva easeOutCirc del perro de la web anterior', () => {
    expect(easeOutCirc(0)).toBe(0);
    expect(easeOutCirc(1)).toBe(1);
    expect(easeOutCirc(0.5)).toBeCloseTo(Math.sqrt(1 - 0.5 ** 4));
  });
});

describe('createIslandControls: animación de entrada', () => {
  it('con reduced-motion no hay entrada', () => {
    expect(controls.introPlaying).toBe(false);
  });

  it('gira alrededor del target a la misma altura y termina en el encuadre inicial', () => {
    setup(false);
    const start = camera.position.clone();
    expect(controls.introPlaying).toBe(true);

    run(30);
    expect(controls.introPlaying).toBe(true);
    expect(camera.position.y).toBeCloseTo(start.y);
    expect(camera.position.length()).toBeCloseTo(start.length());
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0.1);

    // 1.5 s a 60 cuadros por segundo, y uno más.
    run(61);
    expect(controls.introPlaying).toBe(false);
    expect(controls.autoRotating).toBe(true);
    // Desde ahí sigue el autoRotate lento: un cuadro apenas mueve la cámara.
    expect(camera.position.distanceTo(start)).toBeLessThan(0.05);
  });

  it('se corta al arrastrar, y la cámara sigue desde donde estaba', () => {
    setup(false);
    run(20);
    pointer('pointerdown', canvas);
    pointer('pointerup', document);
    expect(controls.introPlaying).toBe(false);
    expect(controls.autoRotating).toBe(false);
  });

  it('se corta con las flechas', () => {
    setup(false);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    expect(controls.introPlaying).toBe(false);
  });
});

describe('createIslandControls: restablecer con doble clic y R', () => {
  function moveAway() {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', shiftKey: true, bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    run();
  }

  it('la tecla R vuelve al encuadre inicial sin desplazar la página', () => {
    const start = camera.position.clone();
    moveAway();
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);

    const event = new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    run();
    expect(event.defaultPrevented).toBe(true);
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it('Ctrl+R y Cmd+R no se tocan: el navegador recarga', () => {
    const start = camera.position.clone();
    moveAway();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true, ...modifier });
      canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    run();
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);
  });

  it('el doble clic vuelve al encuadre inicial y reanuda el giro', () => {
    setup(false);
    const start = camera.position.clone();
    run(120);
    moveAway();
    expect(controls.autoRotating).toBe(false);

    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-6);
    expect(controls.autoRotating).toBe(true);
  });

  it('tras dispose, ni el doble clic ni R hacen nada', () => {
    const start = camera.position.clone();
    moveAway();
    const moved = camera.position.clone();
    controls.dispose();
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    expect(camera.position.distanceTo(moved)).toBe(0);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0);
  });
});

describe('createIslandControls: límites', () => {
  /** Arrastra con el botón izquierdo `dy` píxeles en vertical. */
  function dragVertical(dy: number) {
    pointer('pointerdown', canvas);
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: dy });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    Object.defineProperty(move, 'pointerId', { value: 1 });
    canvas.dispatchEvent(move);
    pointer('pointerup', document);
    run(300);
  }

  it('gira en vertical hasta los polos: ve la isla desde arriba y desde abajo', () => {
    const radius = camera.position.length();
    dragVertical(2000);
    expect(camera.position.y).toBeGreaterThan(radius * 0.999);
    controls.reset();
    dragVertical(-2000);
    expect(camera.position.y).toBeLessThan(-radius * 0.999);
  });

  it('la cámara no entra en la esfera de la isla ni se aleja más de 4 veces el encuadre', () => {
    pointer('pointerdown', canvas, { button: 1 });
    pointer('pointerup', document, { button: 1 });
    for (let index = 0; index < 200; index++) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      run(1);
    }
    run(300);
    // frame(10, 1, 3): radio de la isla 3 más 1 de holgura del target.
    expect(camera.position.distanceTo(new Vector3())).toBeCloseTo(4, 3);

    for (let index = 0; index < 200; index++) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
      run(1);
    }
    run(300);
    expect(camera.position.distanceTo(new Vector3())).toBeCloseTo(40, 3);
  });
});
