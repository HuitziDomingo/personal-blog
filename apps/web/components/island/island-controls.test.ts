// @vitest-environment jsdom
import { PerspectiveCamera, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTO_ROTATE_SPEED,
  createIslandControls,
  easeOutCubic,
  INTRO_DURATION,
  INTRO_TURNS,
  introAngle,
  type IslandControls,
  islandRange,
  KEY_ROTATE_ANGLE,
  MAX_DISTANCE_FACTOR,
  minCameraDistance,
  SURFACE_MARGIN_FACTOR,
} from './island-controls';
import type { PointPicker, SurfaceProbe } from './island-surface';

let canvas: HTMLCanvasElement;
let camera: PerspectiveCamera;
let controls: IslandControls;
/** Reloj de los tests, en milisegundos como `performance.now()`. */
let clock: number;

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

/** Encuadre de los tests: cámara a 10, isla de radio 3. */
const DISTANCE = 10;
const MODEL_RADIUS = 3;
const RANGE = islandRange(DISTANCE, MODEL_RADIUS);

/** Picker de los tests: una esfera de radio 1 en el centro, con un raycast de verdad. */
const sphereRaycaster = new Raycaster();
const pickSphere: PointPicker = (ndc) => {
  camera.updateMatrixWorld();
  sphereRaycaster.setFromCamera(ndc, camera);
  return sphereRaycaster.ray.intersectSphere(new Sphere(new Vector3(), 1), new Vector3()) ?? undefined;
};

function setup(reducedMotion: boolean, surface: SurfaceProbe = () => 0, pick: PointPicker = () => undefined) {
  controls.dispose();
  camera.position.set(0, 4, 9).setLength(DISTANCE);
  camera.up.set(0, 1, 0);
  motion = fakeMotionQuery(reducedMotion);
  controls = createIslandControls(camera, canvas, { reducedMotion: motion });
  controls.frame({ distance: DISTANCE, modelRadius: MODEL_RADIUS, surface, pick });
}

/** Avanza `frames` cuadros de `ms` milisegundos, como el bucle de render. */
function run(frames = 30, ms = 1000 / 60) {
  for (let index = 0; index < frames; index++) {
    clock += ms;
    controls.update(clock);
  }
}

function pointer(
  type: string,
  target: EventTarget,
  init: { pointerType?: string; pointerId?: number; button?: number; x?: number; y?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: type !== 'pointerleave',
    cancelable: true,
    button: init.button ?? 0,
    clientX: init.x ?? 200,
    clientY: init.y ?? 150,
  });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  // jsdom no tiene scroll: la posición en la página es la del viewport.
  Object.defineProperty(event, 'pageX', { value: init.x ?? 200 });
  Object.defineProperty(event, 'pageY', { value: init.y ?? 150 });
  target.dispatchEvent(event);
  return event;
}

/** Arrastra con el ratón de (x0, y0) a (x1, y1) en `steps` pasos, un cuadro por paso. */
function drag(from: [number, number], to: [number, number], { button = 0, steps = 10 } = {}) {
  pointer('pointerdown', canvas, { button, x: from[0], y: from[1] });
  for (let step = 1; step <= steps; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / steps;
    const y = from[1] + ((to[1] - from[1]) * step) / steps;
    pointer('pointermove', document, { button, x, y });
    run(1);
  }
  pointer('pointerup', document, { button, x: to[0], y: to[1] });
}

function key(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  canvas.dispatchEvent(event);
  return event;
}

function wheel(deltaY = 100, x = 0, y = 0): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

/** Activa la rueda (un clic con el botón central, que no arrastra). */
function enableWheel() {
  pointer('pointerdown', canvas, { button: 1 });
  pointer('pointerup', document, { button: 1 });
}

function touchMove(fingers: number): Event {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: { length: fingers } });
  canvas.dispatchEvent(event);
  return event;
}

/** Ángulo de la cámara alrededor de la vertical, en radianes. */
function azimuth(): number {
  return Math.atan2(camera.position.x, camera.position.z);
}

beforeEach(() => {
  // jsdom no implementa la captura de puntero ni el layout.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  Object.defineProperty(canvas, 'clientWidth', { value: 400 });
  Object.defineProperty(canvas, 'clientHeight', { value: 300 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
  document.body.append(canvas);
  clock = 1000;
  camera = new PerspectiveCamera(30, 4 / 3, 0.1, 100);
  // Sin giro automático por defecto: así la cámara solo se mueve por el usuario.
  motion = fakeMotionQuery(true);
  controls = createIslandControls(camera, canvas, { reducedMotion: motion });
  setup(true);
});

afterEach(() => {
  controls.dispose();
  document.body.replaceChildren();
});

describe('createIslandControls: giro libre (TrackballControls)', () => {
  it('arrastrar en vertical pasa por encima del polo y sigue al otro lado', () => {
    const radius = camera.position.length();
    let highest = -Infinity;
    // 100 px son 1.5 rad; con la inercia, unos 160° en total.
    pointer('pointerdown', canvas, { x: 200, y: 100 });
    for (let y = 100; y <= 200; y += 10) {
      pointer('pointermove', document, { x: 200, y });
      run(1);
      highest = Math.max(highest, camera.position.y);
    }
    pointer('pointerup', document, { x: 200, y: 200 });
    for (let index = 0; index < 200; index++) {
      run(1);
      highest = Math.max(highest, camera.position.y);
    }
    // Pasó por arriba de la isla y quedó del otro lado, cabeza abajo respecto al inicio.
    expect(highest).toBeGreaterThan(radius * 0.99);
    expect(camera.position.z).toBeLessThan(0);
    expect(camera.up.y).toBeLessThan(0);
    expect(camera.position.length()).toBeCloseTo(radius, 6);
  });

  it('las flechas giran 15° por pulsación, también por encima del polo', () => {
    const start = camera.position.clone();
    key('ArrowRight');
    expect(camera.position.angleTo(start)).toBeCloseTo(KEY_ROTATE_ANGLE, 6);

    // ↑ sube la cámara (la isla, vista desde arriba) y ↓ la baja.
    controls.reset();
    key('ArrowUp');
    expect(camera.position.y).toBeGreaterThan(start.y);
    controls.reset();
    key('ArrowDown');
    expect(camera.position.y).toBeLessThan(start.y);

    controls.reset();
    // 12 × 15° = 180°: la cámara da media vuelta en vertical y pasa por el polo.
    for (let index = 0; index < 12; index++) {
      key('ArrowUp');
    }
    expect(camera.position.x).toBeCloseTo(0, 6);
    expect(camera.position.y).toBeCloseTo(-start.y, 6);
    expect(camera.position.z).toBeCloseTo(-start.z, 6);
  });

  it('Mayúsculas + flechas mueven la vista sin girarla', () => {
    const direction = camera.getWorldDirection(new Vector3());
    key('ArrowLeft', { shiftKey: true });
    run(1);
    expect(camera.getWorldDirection(new Vector3()).angleTo(direction)).toBeLessThan(1e-9);
    expect(camera.position.distanceTo(new Vector3(0, 4, 9).setLength(DISTANCE))).toBeGreaterThan(0);
  });

  it('las flechas no desplazan la página; con Ctrl o Cmd no se tocan', () => {
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(key('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key('ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('las teclas A, S y D de TrackballControls no cambian el modo desde cualquier parte de la página', () => {
    // Con las teclas por defecto, A pulsada en `window` haría girar el arrastre derecho.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    const direction = camera.getWorldDirection(new Vector3());
    drag([200, 150], [300, 150], { button: 2 });
    run(100);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    // Movió (pan), no giró.
    expect(camera.getWorldDirection(new Vector3()).angleTo(direction)).toBeLessThan(1e-9);
    expect(camera.position.x).not.toBeCloseTo(0, 3);
  });
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
    enableWheel();
    expect(wheel(-100).defaultPrevented).toBe(true);
    run();
    expect(camera.position.length()).toBeLessThan(DISTANCE);

    pointer('pointerleave', canvas);
    expect(wheel().defaultPrevented).toBe(false);
  });

  it('cada paso de rueda avanza bastante: más de un 20 %', () => {
    enableWheel();
    wheel(-100);
    run(120);
    expect(camera.position.length()).toBeLessThan(DISTANCE * 0.8);
  });
});

describe('createIslandControls: táctil', () => {
  it('deja un dedo para el scroll vertical de la página', () => {
    expect(canvas.style.touchAction).toBe('pan-y');
    expect(touchMove(1).defaultPrevented).toBe(false);
  });

  it('con dos dedos impide el scroll', () => {
    expect(touchMove(2).defaultPrevented).toBe(true);
  });

  it('un dedo no gira la isla ni para el giro automático', () => {
    setup(false);
    run(200);
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1, x: 100, y: 150 });
    const before = azimuth();
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 1, x: 300, y: 150 });
    expect(azimuth()).toBe(before);
    expect(controls.autoRotating).toBe(true);
  });

  it('dos dedos paran el giro, giran al arrastrar y acercan al separarse', () => {
    setup(false);
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1, x: 150, y: 150 });
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 2, x: 250, y: 150 });
    expect(controls.autoRotating).toBe(false);
    expect(controls.introPlaying).toBe(false);

    const before = azimuth();
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 1, x: 200, y: 150 });
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 2, x: 300, y: 150 });
    expect(azimuth()).not.toBeCloseTo(before, 3);

    const distance = camera.position.length();
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 1, x: 100, y: 150 });
    expect(camera.position.length()).toBeLessThan(distance);
  });
});

describe('createIslandControls: giro automático', () => {
  it('sin reduced-motion, la cámara gira sola alrededor de la vertical', () => {
    setup(false);
    run(200);
    const before = azimuth();
    run(60);
    expect(controls.autoRotating).toBe(true);
    // Un segundo: ω radianes, en sentido negativo.
    expect(azimuth() - before).toBeCloseTo(-AUTO_ROTATE_SPEED, 6);
    expect(camera.up.y).toBeCloseTo(1, 9);
  });

  it('con reduced-motion no gira, ni siquiera tras restablecer', () => {
    const start = camera.position.clone();
    run();
    expect(controls.autoRotating).toBe(false);
    expect(camera.position.distanceTo(start)).toBe(0);
    controls.reset();
    expect(controls.autoRotating).toBe(false);
  });

  it('se detiene al arrastrar y no se reanuda al soltar; la inercia se apaga', () => {
    setup(false);
    drag([200, 150], [260, 150]);
    expect(controls.autoRotating).toBe(false);
    run(300);
    const stopped = camera.position.clone();
    run();
    expect(camera.position.distanceTo(stopped)).toBeLessThan(1e-9);
  });

  it('se detiene con la rueda, una vez activa', () => {
    setup(false);
    run(100);
    enableWheel();
    // El clic con el botón central ya cuenta como interacción.
    expect(controls.autoRotating).toBe(false);
  });

  it('se detiene con las flechas, no con Tab ni Escape', () => {
    setup(false);
    key('Tab');
    key('Escape');
    expect(controls.autoRotating).toBe(true);
    key('ArrowRight');
    expect(controls.autoRotating).toBe(false);
  });

  it('si reduced-motion se activa en caliente, el giro se para y no vuelve', () => {
    setup(false);
    motion.change(true);
    expect(controls.autoRotating).toBe(false);
    controls.reset();
    expect(controls.autoRotating).toBe(false);
  });

  it('tras una pausa larga del bucle no salta más de 0.1 s de giro', () => {
    setup(false);
    run(200);
    const before = azimuth();
    run(1, 5000);
    expect(azimuth() - before).toBeCloseTo(-AUTO_ROTATE_SPEED * 0.1, 6);
  });
});

describe('createIslandControls: restablecer con doble clic y R', () => {
  function moveAway() {
    for (let index = 0; index < 7; index++) {
      key('ArrowUp');
    }
    key('ArrowLeft', { shiftKey: true });
    run();
  }

  it('R devuelve posición, vertical y target al encuadre inicial, sin desplazar la página', () => {
    const start = camera.position.clone();
    moveAway();
    expect(camera.up.y).toBeLessThan(0.9);

    const event = key('KeyR');
    run();
    expect(event.defaultPrevented).toBe(true);
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
    expect(camera.up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-9);
  });

  it('borra la inercia: tras soltar un arrastre rápido, la cámara se queda en el encuadre', () => {
    const start = camera.position.clone();
    drag([100, 150], [300, 100], { steps: 3 });
    controls.reset();
    run(60);
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('Ctrl+R y Cmd+R no se tocan: el navegador recarga', () => {
    const start = camera.position.clone();
    moveAway();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(key('KeyR', modifier).defaultPrevented).toBe(false);
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
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
    expect(controls.autoRotating).toBe(true);
  });

  it('dispose quita todo: ni doble clic, ni R, ni rueda, ni táctil', () => {
    moveAway();
    const moved = camera.position.clone();
    controls.dispose();
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    key('KeyR');
    expect(camera.position.distanceTo(moved)).toBe(0);
    expect(canvas.style.touchAction).toBe('');
    pointer('pointerdown', canvas);
    expect(wheel().defaultPrevented).toBe(false);
    expect(touchMove(2).defaultPrevented).toBe(false);
  });
});

describe('introAngle', () => {
  const T = INTRO_DURATION;

  it('empieza en 0 (la vista de la imagen fija) y en 1.5 s gira dos vueltas más lo del giro automático', () => {
    expect(T).toBe(1.5);
    expect(introAngle(0)).toBe(0);
    expect(introAngle(T)).toBeCloseTo(INTRO_TURNS * 2 * Math.PI + AUTO_ROTATE_SPEED * T, 12);
    expect(introAngle(10)).toBe(introAngle(T));
  });

  it('frena sin pararse: la velocidad baja siempre y nunca es menor que la del giro automático', () => {
    const h = 1e-4;
    let previous = Infinity;
    for (let step = 0; step <= 30; step++) {
      const t = Math.min((step / 30) * T, T - h);
      const speed = (introAngle(t + h) - introAngle(t)) / h;
      expect(speed).toBeLessThan(previous);
      expect(speed).toBeGreaterThanOrEqual(AUTO_ROTATE_SPEED * 0.999);
      previous = speed;
    }
  });

  it('termina con la misma velocidad que el giro automático (derivada en t = T)', () => {
    const h = 1e-5;
    const endSpeed = (introAngle(T) - introAngle(T - h)) / h;
    expect(endSpeed).toBeCloseTo(AUTO_ROTATE_SPEED, 6);
  });

  it('usa easeOutCubic', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe('createIslandControls: animación de entrada', () => {
  it('con reduced-motion no hay entrada', () => {
    expect(controls.introPlaying).toBe(false);
  });

  it('el primer cuadro es la vista de la imagen fija', () => {
    setup(false);
    const start = camera.position.clone();
    run(1);
    // El primer `update` fija el inicio; el reloj ya avanzó un cuadro en `run`.
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('va por tiempo, no por cuadros: a 30 y a 144 fps está en el mismo sitio', () => {
    setup(false);
    run(1);
    run(15, 1000 / 30);
    const at30 = camera.position.clone();

    setup(false);
    run(1);
    run(72, 1000 / 144);
    expect(camera.position.distanceTo(at30)).toBeLessThan(1e-9);
  });

  it('empalma con el giro automático: sin salto de posición ni de velocidad', () => {
    setup(false);
    run(1);
    const dt = 1000 / 600;
    const angles: number[] = [];
    // De 1.4 s a 1.6 s, a 600 cuadros por segundo.
    run(Math.round(1400 / dt), dt);
    for (let index = 0; index < 120; index++) {
      run(1, dt);
      angles.push(azimuth());
    }
    expect(controls.introPlaying).toBe(false);
    const speeds = angles.slice(1).map((angle, index) => {
      let step = angle - (angles[index] ?? 0);
      // Sin el salto de −π a π de atan2.
      step -= Math.round(step / (2 * Math.PI)) * 2 * Math.PI;
      return -step / (dt / 1000);
    });
    // Ni saltos de posición (ningún paso mayor que el anterior) ni escalón de velocidad al final.
    for (let index = 1; index < speeds.length; index++) {
      expect(speeds[index]).toBeLessThanOrEqual((speeds[index - 1] ?? 0) + 1e-6);
    }
    expect(speeds.at(-1)).toBeCloseTo(AUTO_ROTATE_SPEED, 4);
    expect(camera.position.y).toBeCloseTo(new Vector3(0, 4, 9).setLength(DISTANCE).y, 9);
  });

  it('si el usuario la toca, se detiene ahí sin saltar', () => {
    setup(false);
    run(1);
    run(30);
    expect(controls.introPlaying).toBe(true);
    const at = camera.position.clone();
    pointer('pointerdown', canvas);
    pointer('pointerup', document);
    expect(controls.introPlaying).toBe(false);
    expect(controls.autoRotating).toBe(false);
    run(10);
    expect(camera.position.distanceTo(at)).toBeLessThan(1e-9);
  });

  it('se corta con las flechas', () => {
    setup(false);
    key('ArrowLeft');
    expect(controls.introPlaying).toBe(false);
  });
});

describe('createIslandControls: zoom y topes', () => {
  it('se aleja hasta MAX_DISTANCE_FACTOR veces el encuadre, no más', () => {
    enableWheel();
    for (let index = 0; index < 60; index++) {
      wheel(100);
      run(2);
    }
    run(300);
    expect(MAX_DISTANCE_FACTOR).toBe(6);
    expect(camera.position.length()).toBeCloseTo(DISTANCE * MAX_DISTANCE_FACTOR, 6);
  });

  it('se acerca hasta la superficie del modelo más el margen, desde cualquier dirección', () => {
    // Una superficie a 2 del target en cualquier dirección.
    setup(true, () => 2);
    for (let index = 0; index < 7; index++) {
      key('ArrowUp');
    }
    enableWheel();
    for (let index = 0; index < 60; index++) {
      wheel(-100);
      run(2);
    }
    run(300);
    expect(camera.position.length()).toBeCloseTo(2 + MODEL_RADIUS * SURFACE_MARGIN_FACTOR, 6);
  });

  it('el pellizco también respeta la superficie', () => {
    setup(true, () => 2);
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1, x: 190, y: 150 });
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 2, x: 210, y: 150 });
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 1, x: 0, y: 150 });
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 2, x: 400, y: 150 });
    run(1);
    expect(camera.position.length()).toBeCloseTo(2 + MODEL_RADIUS * SURFACE_MARGIN_FACTOR, 6);
  });

  it('sin superficie en esa dirección, el tope es el piso fijo', () => {
    enableWheel();
    for (let index = 0; index < 80; index++) {
      wheel(-100);
      run(2);
    }
    run(300);
    expect(camera.position.length()).toBeCloseTo(RANGE.minDistance, 6);
  });

  it('al mover, el target no sale de la esfera de la isla', () => {
    drag([0, 150], [400, 150], { button: 2 });
    drag([0, 150], [400, 150], { button: 2 });
    run(200);
    // El target está en la línea de mirada; su distancia al centro es como mucho el radio, 3.
    const direction = camera.getWorldDirection(new Vector3());
    const toCenter = new Vector3().sub(camera.position);
    const offLine = toCenter.clone().sub(direction.multiplyScalar(toCenter.dot(direction)));
    expect(offLine.length()).toBeLessThanOrEqual(MODEL_RADIUS + 1e-6);
    expect(offLine.length()).toBeGreaterThan(1);
  });
});

describe('islandRange y minCameraDistance', () => {
  it('el plano cercano queda por debajo del margen y el lejano pasa la isla vista desde el máximo', () => {
    expect(RANGE.near).toBeLessThan(RANGE.margin);
    expect(RANGE.near).toBeLessThan(RANGE.minDistance);
    expect(RANGE.far).toBeGreaterThan(RANGE.maxDistance + MODEL_RADIUS + 1);
  });

  it('el tope es la superficie más el margen, y nunca menos que el piso', () => {
    expect(minCameraDistance(2, RANGE)).toBeCloseTo(2 + RANGE.margin);
    expect(minCameraDistance(0, RANGE)).toBe(RANGE.minDistance);
    expect(minCameraDistance(0.01, RANGE)).toBe(RANGE.minDistance);
  });
});

describe('createIslandControls: zoom hacia el puntero', () => {
  /** Posición en pantalla (coordenadas normalizadas) de un punto del mundo. */
  function onScreen(point: Vector3) {
    camera.updateMatrixWorld();
    const projected = point.clone().project(camera);
    return [projected.x, projected.y];
  }

  it('con la rueda, el punto bajo el puntero se queda quieto en la pantalla', () => {
    setup(true, () => 0, pickSphere);
    enableWheel();
    // A la derecha y arriba del centro, sobre la esfera.
    const [x, y] = [215, 140];
    const point = pickSphere(new Vector2((x / 400) * 2 - 1, -(y / 300) * 2 + 1));
    expect(point).toBeDefined();
    const before = onScreen(point as Vector3);
    const distance = camera.position.distanceTo(point as Vector3);
    for (let index = 0; index < 4; index++) {
      wheel(-100, x, y);
      run(30);
    }
    const after = onScreen(point as Vector3);
    expect(after[0]).toBeCloseTo(before[0] ?? 0, 6);
    expect(after[1]).toBeCloseTo(before[1] ?? 0, 6);
    expect(camera.position.distanceTo(point as Vector3)).toBeLessThan(distance * 0.5);
    // El target se fue hacia el punto.
    expect(controls.autoRotating).toBe(false);
  });

  it('con el puntero fuera de la isla, se acerca al centro como siempre', () => {
    setup(true, () => 0, pickSphere);
    enableWheel();
    const direction = camera.position.clone().normalize();
    wheel(-100, 2, 2);
    run(60);
    // Mismo eje: la cámara solo se acercó al target, que sigue en el centro.
    expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-9);
    expect(camera.position.length()).toBeLessThan(DISTANCE);
  });

  it('con dos dedos, el punto entre ellos se queda quieto', () => {
    setup(true, () => 0, pickSphere);
    const point = pickSphere(new Vector2(0.1, 0.05)) as Vector3;
    // (220, 142.5) en el canvas de 400 × 300 es (0.1, 0.05).
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 1, x: 210, y: 142.5 });
    pointer('pointerdown', canvas, { pointerType: 'touch', pointerId: 2, x: 230, y: 142.5 });
    const before = onScreen(point);
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 1, x: 200, y: 142.5 });
    pointer('pointermove', canvas, { pointerType: 'touch', pointerId: 2, x: 240, y: 142.5 });
    const after = onScreen(point);
    // Cada dedo llega en su propio evento: entre los dos, el centro se movió un
    // poco y hubo algo de giro. El punto apenas se mueve (menos de 1 px de 400).
    expect(after[0]).toBeCloseTo(before[0] ?? 0, 2);
    expect(after[1]).toBeCloseTo(before[1] ?? 0, 2);
    expect(camera.position.length()).toBeLessThan(DISTANCE);
  });

  it('se para en la superficie: la cámara no atraviesa el modelo', () => {
    // La superficie, a 1.5 del target en cualquier dirección; la sonda apunta el target que recibe.
    const lastTarget = new Vector3();
    setup(
      true,
      (at) => {
        lastTarget.copy(at);
        return 1.5;
      },
      pickSphere,
    );
    enableWheel();
    for (let index = 0; index < 40; index++) {
      wheel(-100, 205, 145);
      run(10);
    }
    run(120);
    const reached = camera.position.clone();
    expect(camera.position.distanceTo(lastTarget)).toBeCloseTo(1.5 + MODEL_RADIUS * SURFACE_MARGIN_FACTOR, 6);
    // En el tope, más rueda ya no mueve nada (ni la cámara ni la vista).
    for (let index = 0; index < 10; index++) {
      wheel(-100, 205, 145);
      run(10);
    }
    expect(camera.position.distanceTo(reached)).toBeLessThan(1e-6);
  });

  it('al alejarse, el target vuelve al centro: en el máximo, la isla está en medio', () => {
    setup(true, () => 0, pickSphere);
    enableWheel();
    for (let index = 0; index < 6; index++) {
      wheel(-100, 230, 130);
      run(30);
    }
    // El target se movió: la cámara ya no mira al centro.
    expect(camera.getWorldDirection(new Vector3()).angleTo(camera.position.clone().negate())).toBeGreaterThan(1e-3);
    for (let index = 0; index < 40; index++) {
      wheel(100, 230, 130);
      run(30);
    }
    expect(camera.position.length()).toBeCloseTo(DISTANCE * MAX_DISTANCE_FACTOR, 6);
    expect(camera.getWorldDirection(new Vector3()).angleTo(camera.position.clone().negate())).toBeLessThan(1e-9);
  });

  it('el zoom de la rueda va por tiempo y es suave: no salta de golpe', () => {
    enableWheel();
    run(1);
    wheel(-100);
    run(1);
    const first = DISTANCE - camera.position.length();
    run(120);
    const total = DISTANCE - camera.position.length();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(total * 0.5);
    expect(camera.position.length()).toBeCloseTo(DISTANCE * Math.exp(-0.3), 6);
  });
});
