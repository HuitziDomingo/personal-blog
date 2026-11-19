// @vitest-environment jsdom
import { Euler, Group, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTO_ROTATE_RAMP,
  AUTO_ROTATE_SPEED,
  createIslandControls,
  easeOutCirc,
  INERTIA_TIME,
  INTRO_DURATION,
  INTRO_TURNS,
  introAngle,
  type IslandControls,
  islandOrientation,
  islandRange,
  KEY_ROTATE_ANGLE,
  MAX_DISTANCE_FACTOR,
  minCameraDistance,
  PAN_SPEED,
  rampAngle,
  ROTATE_SPEED,
  SURFACE_MARGIN_FACTOR,
} from './island-controls';
import type { PointPicker, SurfaceProbe } from './island-surface';

let canvas: HTMLCanvasElement;
let camera: PerspectiveCamera;
let model: Group;
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

/** Encuadre de los tests: cámara a 10 (25° sobre el horizonte), isla de radio 3, yaw inicial 0.3. */
const DISTANCE = 10;
const MODEL_RADIUS = 3;
const START_YAW = 0.3;
const ELEVATION = (25 * Math.PI) / 180;
const RANGE = islandRange(DISTANCE, MODEL_RADIUS);
const WIDTH = 400;
const HEIGHT = 300;

/** Picker de los tests: una esfera de radio 1 en el centro, con un raycast de verdad. */
const sphereRaycaster = new Raycaster();
const pickSphere: PointPicker = (ndc) => {
  camera.updateMatrixWorld();
  sphereRaycaster.setFromCamera(ndc, camera);
  return sphereRaycaster.ray.intersectSphere(new Sphere(new Vector3(), 1), new Vector3()) ?? undefined;
};

function setup(
  reducedMotion: boolean,
  surface: SurfaceProbe = () => 0,
  pick: PointPicker = () => undefined,
  { visible = true } = {},
) {
  controls.dispose();
  camera.position.set(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(DISTANCE);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  model = new Group();
  motion = fakeMotionQuery(reducedMotion);
  controls = createIslandControls(camera, canvas, { model, reducedMotion: motion });
  controls.frame({ distance: DISTANCE, yaw: START_YAW, modelRadius: MODEL_RADIUS, surface, pick });
  // Como la escena al quitar el spinner: la isla ya se ve.
  if (visible) {
    controls.play();
  }
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
  init: { pointerType?: string; pointerId?: number; button?: number; x?: number; y?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: type !== 'pointerleave',
    cancelable: true,
    button: init.button ?? 0,
    clientX: init.x ?? WIDTH / 2,
    clientY: init.y ?? HEIGHT / 2,
  });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'timeStamp', { value: clock });
  canvas.dispatchEvent(event);
  return event;
}

/** Arrastra con el ratón de `from` a `to` en `steps` pasos, un cuadro por paso; suelta al final si `release`. */
function drag(from: [number, number], to: [number, number], { button = 0, steps = 10, release = true } = {}) {
  pointer('pointerdown', { button, x: from[0], y: from[1] });
  for (let step = 1; step <= steps; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / steps;
    const y = from[1] + ((to[1] - from[1]) * step) / steps;
    run(1);
    pointer('pointermove', { button, x, y });
  }
  if (release) {
    pointer('pointerup', { button, x: to[0], y: to[1] });
  }
}

function touch(type: string, id: number, x: number, y: number) {
  pointer(type, { pointerType: 'touch', pointerId: id, x, y });
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

/** Activa la rueda (un clic con el botón central, que no gira ni mueve). */
function enableWheel() {
  pointer('pointerdown', { button: 1 });
  pointer('pointerup', { button: 1 });
}

function touchMove(fingers: number): Event {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: { length: fingers } });
  canvas.dispatchEvent(event);
  return event;
}

/** Eje local de la isla en el mundo. */
function modelAxis(x: number, y: number, z: number): Vector3 {
  model.updateMatrixWorld(true);
  return new Vector3(x, y, z).transformDirection(model.matrixWorld);
}

/** Posición en pantalla (coordenadas normalizadas) de un punto del mundo. */
function onScreen(point: Vector3) {
  camera.updateMatrixWorld();
  const projected = point.clone().project(camera);
  return [projected.x, projected.y] as const;
}

/** El punto de la superficie de una isla esférica que mira a la cámara, en coordenadas locales de la isla. */
function frontPointLocal(): Vector3 {
  model.updateMatrixWorld(true);
  const toCamera = camera.position.clone().normalize();
  return toCamera.applyMatrix4(new Matrix4().copy(model.matrixWorld).invert());
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  Object.defineProperty(canvas, 'clientWidth', { value: WIDTH });
  Object.defineProperty(canvas, 'clientHeight', { value: HEIGHT });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) as DOMRect;
  document.body.append(canvas);
  clock = 1000;
  camera = new PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 100);
  model = new Group();
  motion = fakeMotionQuery(true);
  controls = createIslandControls(camera, canvas, { model, reducedMotion: motion });
  // Sin giro automático por defecto: así la isla solo se mueve por el usuario.
  setup(true);
});

afterEach(() => {
  controls.dispose();
  document.body.replaceChildren();
});

describe('islandOrientation: tornamesa sin roll', () => {
  it('compone pitch(X)·yaw(Y): primero el yaw de la isla y después el pitch del mundo', () => {
    const yaw = 1.1;
    const pitch = -0.7;
    const expected = new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), pitch)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
    const actual = new Quaternion().setFromEuler(islandOrientation(yaw, pitch));
    expect(Math.abs(actual.dot(expected))).toBeCloseTo(1, 12);
    expect(islandOrientation(yaw, pitch).order).toBe('XYZ');
  });

  it('tras muchas vueltas de yaw y de pitch (arrastres, flechas, inercia y giro), la isla no se inclina de lado', () => {
    setup(false);
    run(200);
    const moves: [number, number][] = [
      [380, 20],
      [20, 280],
      [300, 150],
      [60, 40],
      [390, 290],
    ];
    for (let round = 0; round < 6; round++) {
      for (const [x, y] of moves) {
        drag([200, 150], [x, y], { steps: 6 });
        run(20);
      }
      key('ArrowUp');
      key('ArrowLeft');
      run(40);
    }
    expect(Math.abs(controls.yaw)).toBeGreaterThan(2 * Math.PI);
    expect(Math.abs(controls.pitch)).toBeGreaterThan(2 * Math.PI);
    // Sin roll: el eje vertical de la isla no se sale del plano vertical de la
    // cámara (su componente X, el horizontal de la pantalla, es 0)…
    expect(modelAxis(0, 1, 0).x).toBeCloseTo(0, 9);
    // …y el eje X del mundo, el del pitch, sigue siendo horizontal en la isla:
    // ningún eje local se inclina hacia los lados de la pantalla.
    expect(model.rotation.z).toBe(0);
    // Y la orientación es exactamente la de los dos ángulos, sin acumular error.
    const expected = new Quaternion().setFromEuler(new Euler(controls.pitch, controls.yaw, 0, 'XYZ'));
    expect(Math.abs(model.quaternion.dot(expected))).toBeCloseTo(1, 12);
  });
});

describe('createIslandControls: arrastrar gira la isla, no la cámara', () => {
  it('horizontal → yaw; vertical → pitch; la cámara no se mueve', () => {
    const position = camera.position.clone();
    drag([200, 150], [260, 150]);
    expect(controls.yaw - START_YAW).toBeCloseTo((60 * ROTATE_SPEED) / (WIDTH / 2), 9);
    expect(controls.pitch).toBe(0);

    controls.reset();
    drag([200, 150], [200, 180]);
    expect(controls.yaw).toBe(START_YAW);
    expect(controls.pitch).toBeCloseTo((30 * ROTATE_SPEED) / (WIDTH / 2), 9);
    expect(camera.position.distanceTo(position)).toBe(0);
  });

  it('el pitch no tiene límite: puede dar vueltas completas en vertical', () => {
    for (let index = 0; index < 4; index++) {
      drag([200, 0], [200, 300], { steps: 20 });
    }
    expect(controls.pitch).toBeGreaterThan(2 * Math.PI);
  });

  it.each([0, 45, 60, 75, 90, 105, 135, 180])(
    'con pitch %i°, arrastrar a la derecha mueve a la derecha la cara de la isla que mira a la cámara',
    (degrees) => {
      for (let index = 0; index < degrees / 15; index++) {
        key('ArrowUp');
      }
      expect(controls.pitch).toBeCloseTo((degrees * Math.PI) / 180, 9);
      const local = frontPointLocal();
      const before = onScreen(local.clone().applyMatrix4(model.matrixWorld));
      drag([200, 150], [220, 150], { steps: 2 });
      model.updateMatrixWorld(true);
      const after = onScreen(local.clone().applyMatrix4(model.matrixWorld));
      expect(after[0]).toBeGreaterThan(before[0]);
    },
  );

  it('el signo se fija al empezar el arrastre: cruzar los 90° no lo cambia a mitad', () => {
    pointer('pointerdown', { x: 200, y: 0 });
    // Hacia abajo 150 px: 2.25 rad (129°), boca abajo para la cámara.
    for (let y = 15; y <= 150; y += 15) {
      run(1);
      pointer('pointermove', { x: 200, y });
    }
    expect(controls.pitch).toBeCloseTo(2.25, 9);
    const yaw = controls.yaw;
    run(1);
    pointer('pointermove', { x: 240, y: 150 });
    // Mismo signo que al empezar (derecho): el yaw sube.
    expect(controls.yaw).toBeGreaterThan(yaw);
    run(60);
    pointer('pointerup', { x: 240, y: 150 });

    // El siguiente arrastre, ya boca abajo, empieza con el signo invertido.
    const upsideDown = controls.yaw;
    drag([200, 150], [240, 150], { steps: 2 });
    expect(controls.yaw).toBeLessThan(upsideDown);
  });

  it('el botón central no gira ni mueve: solo activa la rueda', () => {
    drag([200, 150], [300, 200], { button: 1 });
    expect(controls.yaw).toBe(START_YAW);
    expect(controls.pitch).toBe(0);
  });

  it('el menú contextual no aparece sobre el canvas (el botón derecho mueve)', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('createIslandControls: inercia', () => {
  it('tras soltar un arrastre rápido sigue girando y se apaga sola', () => {
    drag([100, 150], [300, 150], { steps: 5 });
    const released = controls.yaw;
    run(1);
    expect(controls.yaw).toBeGreaterThan(released);
    run(300);
    const stopped = controls.yaw;
    run(60);
    expect(controls.yaw).toBe(stopped);
  });

  it('decae con el tiempo, no por cuadro: a 30 y a 144 fps acaba en el mismo sitio', () => {
    const settle = (fps: number) => {
      setup(true);
      drag([100, 150], [300, 150], { steps: 5 });
      const start = controls.yaw;
      run(Math.round(fps * 2), 1000 / fps);
      return controls.yaw - start;
    };
    const at30 = settle(30);
    const at144 = settle(144);
    expect(at30).toBeGreaterThan(0);
    expect(at144).toBeCloseTo(at30, 4);
  });

  it('cae a 1/e en INERTIA_TIME', () => {
    drag([100, 150], [300, 150], { steps: 5 });
    const dt = 1;
    const speed = () => {
      const before = controls.yaw;
      run(1, dt);
      return (controls.yaw - before) / (dt / 1000);
    };
    const first = speed();
    run(Math.round((INERTIA_TIME * 1000) / dt) - 1, dt);
    expect(speed() / first).toBeCloseTo(Math.exp(-1), 2);
  });

  it('si el puntero se quedó quieto antes de soltar, no hay inercia', () => {
    pointer('pointerdown', { x: 100, y: 150 });
    run(1);
    pointer('pointermove', { x: 200, y: 150 });
    run(60);
    pointer('pointerup', { x: 200, y: 150 });
    const released = controls.yaw;
    run(60);
    expect(controls.yaw).toBeCloseTo(released, 6);
  });
});

describe('createIslandControls: giro automático, pausa y rampa', () => {
  it('sin reduced-motion, la isla gira sola sumando al yaw', () => {
    setup(false);
    run(200);
    const before = controls.yaw;
    run(60);
    expect(controls.autoRotating).toBe(true);
    expect(controls.yaw - before).toBeCloseTo(AUTO_ROTATE_SPEED, 6);
  });

  it('con reduced-motion no gira, ni siquiera tras restablecer', () => {
    run(60);
    expect(controls.autoRotating).toBe(false);
    expect(controls.yaw).toBe(START_YAW);
    controls.reset();
    expect(controls.autoRotating).toBe(false);
  });

  it('se pausa mientras arrastras, también con el botón pulsado y quieto', () => {
    setup(false);
    run(200);
    pointer('pointerdown', { x: 200, y: 150 });
    const before = controls.yaw;
    run(60);
    expect(controls.yaw).toBe(before);
    pointer('pointerup', { x: 200, y: 150 });
  });

  it('al soltar vuelve con la rampa: velocidad continua desde 0 y normal a los 0.5 s', () => {
    setup(false);
    run(200);
    pointer('pointerdown', { x: 200, y: 150 });
    run(30);
    pointer('pointerup', { x: 200, y: 150 });
    const dt = 1000 / 600;
    const speeds: number[] = [];
    let previous = controls.yaw;
    for (let index = 0; index < 600; index++) {
      run(1, dt);
      speeds.push((controls.yaw - previous) / (dt / 1000));
      previous = controls.yaw;
    }
    expect(speeds[0]).toBeLessThan(AUTO_ROTATE_SPEED * 0.01);
    for (let index = 1; index < speeds.length; index++) {
      expect(Math.abs((speeds[index] ?? 0) - (speeds[index - 1] ?? 0))).toBeLessThan(AUTO_ROTATE_SPEED * 0.01);
    }
    expect(speeds[300]).toBeCloseTo(AUTO_ROTATE_SPEED, 6);
  });

  it('el pan del botón derecho también pausa; la rueda y las flechas no', () => {
    setup(false, () => 0, pickSphere);
    run(200);
    let before = controls.yaw;
    drag([100, 150], [200, 150], { button: 2, release: false });
    expect(controls.yaw).toBe(before);
    pointer('pointerup', { button: 2, x: 200, y: 150 });
    run(60);

    enableWheel();
    before = controls.yaw;
    wheel(-100, 200, 150);
    run(60);
    expect(controls.yaw - before).toBeCloseTo(AUTO_ROTATE_SPEED, 6);

    before = controls.yaw;
    key('ArrowUp');
    run(60);
    expect(controls.yaw - before).toBeCloseTo(AUTO_ROTATE_SPEED, 6);
  });

  it('si reduced-motion se activa en caliente, el giro se para', () => {
    setup(false);
    motion.change(true);
    expect(controls.autoRotating).toBe(false);
  });

  it('tras una pausa larga del bucle no salta más de 0.1 s de giro', () => {
    setup(false);
    run(200);
    const before = controls.yaw;
    run(1, 5000);
    expect(controls.yaw - before).toBeCloseTo(AUTO_ROTATE_SPEED * 0.1, 6);
  });
});

describe('createIslandControls: táctil', () => {
  it('un dedo no gira la isla y deja el scroll vertical a la página', () => {
    expect(canvas.style.touchAction).toBe('pan-y');
    expect(touchMove(1).defaultPrevented).toBe(false);
    touch('pointerdown', 1, 100, 150);
    touch('pointermove', 1, 300, 150);
    expect(controls.yaw).toBe(START_YAW);
  });

  it('con dos dedos impide el scroll', () => {
    expect(touchMove(2).defaultPrevented).toBe(true);
  });

  it('dos dedos: arrastrar el centro gira y pausa; pellizcar acerca y no pausa', () => {
    setup(false, () => 0, pickSphere);
    run(200);
    touch('pointerdown', 1, 180, 150);
    touch('pointerdown', 2, 220, 150);
    // Pellizco simétrico: el centro no se mueve.
    const distance = camera.position.distanceTo(new Vector3());
    touch('pointermove', 1, 170, 150);
    touch('pointermove', 2, 230, 150);
    expect(camera.position.distanceTo(new Vector3())).toBeLessThan(distance);
    let before = controls.yaw;
    run(60);
    expect(controls.yaw - before).toBeCloseTo(AUTO_ROTATE_SPEED, 6);

    // Arrastre: el centro se mueve 40 px a la derecha.
    before = controls.yaw;
    touch('pointermove', 1, 210, 150);
    touch('pointermove', 2, 270, 150);
    expect(controls.yaw).toBeGreaterThan(before);
    const turned = controls.yaw;
    run(60);
    // Pausado (y sin inercia mientras los dedos siguen apoyados).
    expect(controls.yaw).toBe(turned);
  });
});

describe('createIslandControls: teclado', () => {
  it('↑ inclina la cara de arriba hacia la cámara (la isla, vista desde arriba); ↓ al revés', () => {
    key('ArrowUp');
    expect(controls.pitch).toBeCloseTo(KEY_ROTATE_ANGLE, 9);
    expect(modelAxis(0, 1, 0).z).toBeGreaterThan(0);
    controls.reset();
    key('ArrowDown');
    expect(modelAxis(0, 1, 0).z).toBeLessThan(0);
  });

  it('→ gira como arrastrar a la derecha; boca abajo, con el mismo signo invertido', () => {
    key('ArrowRight');
    expect(controls.yaw - START_YAW).toBeCloseTo(KEY_ROTATE_ANGLE, 9);
    controls.reset();
    for (let index = 0; index < 12; index++) {
      key('ArrowUp');
    }
    key('ArrowRight');
    expect(controls.yaw - START_YAW).toBeCloseTo(-KEY_ROTATE_ANGLE, 9);
  });

  it('Mayúsculas + flechas mueven la vista sin girar la isla', () => {
    const position = camera.position.clone();
    key('ArrowLeft', { shiftKey: true });
    expect(camera.position.distanceTo(position)).toBeGreaterThan(0);
    expect(controls.yaw).toBe(START_YAW);
  });

  it('las flechas no desplazan la página; con Ctrl o Cmd no se tocan', () => {
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(key('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key('ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);
  });
});

describe('createIslandControls: pan', () => {
  it('con el botón derecho mueve cámara y target juntos: dx/ancho × distancia × PAN_SPEED / 0.2', () => {
    const start = camera.position.clone();
    const direction = camera.getWorldDirection(new Vector3());
    drag([200, 150], [240, 150], { button: 2 });
    expect(camera.position.distanceTo(start)).toBeCloseTo(((40 / WIDTH) * DISTANCE * PAN_SPEED) / 0.2, 9);
    expect(camera.getWorldDirection(new Vector3()).angleTo(direction)).toBeLessThan(1e-9);
  });

  it('no tiene límite: la isla puede salir del cuadro, y R la devuelve', () => {
    const start = camera.position.clone();
    for (let index = 0; index < 4; index++) {
      drag([0, 150], [400, 150], { button: 2 });
    }
    expect(camera.position.distanceTo(start)).toBeGreaterThan(DISTANCE);
    key('KeyR');
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
  });
});

describe('createIslandControls: rueda y zoom hacia el puntero', () => {
  it('sin clic, la rueda no llama a preventDefault ni acerca', () => {
    const before = camera.position.clone();
    const event = wheel(-100);
    run();
    expect(event.defaultPrevented).toBe(false);
    expect(camera.position.distanceTo(before)).toBe(0);
  });

  it('tras un clic, la rueda acerca; al salir, vuelve a desplazar la página', () => {
    enableWheel();
    expect(wheel(-100).defaultPrevented).toBe(true);
    run();
    expect(camera.position.length()).toBeLessThan(DISTANCE);
    pointer('pointerleave');
    expect(wheel().defaultPrevented).toBe(false);
  });

  it('el zoom va suave y por tiempo: un paso de rueda acerca un 26 %', () => {
    enableWheel();
    run(1);
    wheel(-100);
    run(1);
    const first = DISTANCE - camera.position.length();
    run(120);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan((DISTANCE - camera.position.length()) * 0.5);
    expect(camera.position.length()).toBeCloseTo(DISTANCE * Math.exp(-0.3), 6);
  });

  it('el punto bajo el puntero se queda quieto en la pantalla', () => {
    setup(true, () => 0, pickSphere);
    enableWheel();
    const [x, y] = [215, 140];
    const point = pickSphere(new Vector2((x / WIDTH) * 2 - 1, -(y / HEIGHT) * 2 + 1)) as Vector3;
    const before = onScreen(point);
    for (let index = 0; index < 4; index++) {
      wheel(-100, x, y);
      run(30);
    }
    const after = onScreen(point);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it('con el puntero fuera de la isla, se acerca al centro', () => {
    setup(true, () => 0, pickSphere);
    enableWheel();
    const direction = camera.position.clone().normalize();
    wheel(-100, 2, 2);
    run(60);
    expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-9);
  });

  it('se para en la superficie del modelo girado: la sonda recibe la isla con su orientación', () => {
    const seen: number[] = [];
    setup(true, (at) => {
      seen.push(model.rotation.x);
      return at.length() >= 0 ? 1.5 : 0;
    });
    key('ArrowUp');
    enableWheel();
    for (let index = 0; index < 40; index++) {
      wheel(-100);
      run(10);
    }
    run(120);
    expect(camera.position.length()).toBeCloseTo(1.5 + MODEL_RADIUS * SURFACE_MARGIN_FACTOR, 6);
    expect(seen.at(-1)).toBeCloseTo(KEY_ROTATE_ANGLE, 9);
  });

  it('se aleja hasta MAX_DISTANCE_FACTOR veces el encuadre, no más', () => {
    enableWheel();
    for (let index = 0; index < 60; index++) {
      wheel(100);
      run(2);
    }
    run(300);
    expect(camera.position.length()).toBeCloseTo(DISTANCE * MAX_DISTANCE_FACTOR, 6);
  });
});

describe('createIslandControls: restablecer', () => {
  it('R vuelve a yaw, pitch, pan y zoom iniciales, sin inercia, y el giro sigue', () => {
    setup(false, () => 0, pickSphere);
    run(200);
    const start = camera.position.clone();
    drag([100, 100], [300, 250], { steps: 4 });
    drag([100, 150], [200, 150], { button: 2 });
    enableWheel();
    wheel(-100, 210, 140);
    run(30);
    const event = key('KeyR');
    expect(event.defaultPrevented).toBe(true);
    expect(controls.yaw).toBe(START_YAW);
    expect(controls.pitch).toBe(0);
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
    run(60);
    // Ni inercia ni zoom pendiente: solo el giro automático (con su rampa tras el último arrastre).
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
    expect(controls.yaw).toBeGreaterThan(START_YAW);
    expect(controls.yaw - START_YAW).toBeLessThan(AUTO_ROTATE_SPEED * 1.01);
    expect(controls.autoRotating).toBe(true);
  });

  it('el doble clic también restablece; Ctrl+R y Cmd+R no se tocan', () => {
    drag([200, 150], [260, 200]);
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(controls.yaw).toBe(START_YAW);
    drag([200, 150], [260, 200]);
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(key('KeyR', modifier).defaultPrevented).toBe(false);
    }
    expect(controls.yaw).not.toBe(START_YAW);
  });

  it('dispose quita todo: ni doble clic, ni R, ni rueda, ni arrastre, ni táctil', () => {
    drag([200, 150], [260, 150]);
    const yaw = controls.yaw;
    controls.dispose();
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    key('KeyR');
    pointer('pointerdown', { x: 200, y: 150 });
    pointer('pointermove', { x: 300, y: 150 });
    pointer('pointerup', { x: 300, y: 150 });
    expect(controls.yaw).toBe(yaw);
    expect(canvas.style.touchAction).toBe('');
    expect(wheel().defaultPrevented).toBe(false);
    expect(touchMove(2).defaultPrevented).toBe(false);
  });
});

describe('rampAngle', () => {
  const R = AUTO_ROTATE_RAMP;
  const speed = (t: number, h = 1e-6) => (rampAngle(t + h) - rampAngle(t)) / h;

  it('dura 0.5 s y sube la velocidad de 0 a ω sin saltos ni bajadas', () => {
    expect(R).toBe(0.5);
    expect(rampAngle(0)).toBe(0);
    expect(speed(0)).toBeCloseTo(0, 4);
    let previous = 0;
    for (let step = 1; step <= 50; step++) {
      const current = speed((step / 50) * R - 1e-5);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
    expect(speed(R)).toBeCloseTo(AUTO_ROTATE_SPEED, 4);
  });

  it('después de la rampa sigue a ω, con la mitad de la rampa de retraso', () => {
    expect(rampAngle(R)).toBeCloseTo((AUTO_ROTATE_SPEED * R) / 2, 12);
    expect(rampAngle(R + 2) - rampAngle(R)).toBeCloseTo(AUTO_ROTATE_SPEED * 2, 12);
  });
});

describe('introAngle', () => {
  const T = INTRO_DURATION;

  it('como el perro: empieza en 0 y en 100 cuadros a 60 fps suma 10 vueltas más lo del giro automático', () => {
    expect(T).toBeCloseTo(1.667, 3);
    expect(INTRO_TURNS).toBe(10);
    expect(introAngle(0)).toBe(0);
    expect(introAngle(T)).toBeCloseTo(INTRO_TURNS * 2 * Math.PI + AUTO_ROTATE_SPEED * T, 12);
    expect(introAngle(10)).toBe(introAngle(T));
  });

  it('frena sin pararse y termina a la velocidad del giro automático', () => {
    const h = 1e-5;
    let previous = Infinity;
    for (let step = 0; step <= 30; step++) {
      const t = Math.min((step / 30) * T, T - h);
      const speed = (introAngle(t + h) - introAngle(t)) / h;
      expect(speed).toBeLessThan(previous);
      expect(speed).toBeGreaterThanOrEqual(AUTO_ROTATE_SPEED * 0.999);
      previous = speed;
    }
    expect((introAngle(T) - introAngle(T - h)) / h).toBeCloseTo(AUTO_ROTATE_SPEED, 6);
  });

  it('usa easeOutCirc, la curva del perro', () => {
    expect(easeOutCirc(0)).toBe(0);
    expect(easeOutCirc(1)).toBe(1);
    expect(easeOutCirc(0.5)).toBeCloseTo(Math.sqrt(1 - 0.5 ** 4));
  });
});

describe('createIslandControls: animación de entrada', () => {
  it('con reduced-motion no hay entrada', () => {
    expect(controls.introPlaying).toBe(false);
  });

  it('espera a que la isla se vea: hasta `play`, no gira', () => {
    setup(false, () => 0, () => undefined, { visible: false });
    run(120);
    expect(controls.introPlaying).toBe(true);
    expect(controls.yaw).toBe(START_YAW);
    controls.play();
    run(1);
    expect(controls.yaw).toBe(START_YAW);
    run(10);
    expect(controls.yaw - START_YAW).toBeGreaterThan(1);
  });

  it('suma al yaw por tiempo, no por cuadros: a 30 y a 144 fps está en el mismo sitio', () => {
    setup(false);
    run(1);
    run(15, 1000 / 30);
    const at30 = controls.yaw;
    setup(false);
    run(1);
    run(72, 1000 / 144);
    expect(controls.yaw).toBeCloseTo(at30, 9);
    expect(controls.pitch).toBe(0);
  });

  it('empalma con el giro automático: sin salto de posición ni de velocidad', () => {
    setup(false);
    run(1);
    const dt = 1000 / 600;
    run(Math.round((INTRO_DURATION * 1000 - 100) / dt), dt);
    const speeds: number[] = [];
    let previous = controls.yaw;
    for (let index = 0; index < 120; index++) {
      run(1, dt);
      speeds.push((controls.yaw - previous) / (dt / 1000));
      previous = controls.yaw;
    }
    expect(controls.introPlaying).toBe(false);
    for (let index = 1; index < speeds.length; index++) {
      expect(speeds[index]).toBeLessThanOrEqual((speeds[index - 1] ?? 0) + 1e-6);
    }
    expect(speeds.at(-1)).toBeCloseTo(AUTO_ROTATE_SPEED, 4);
  });

  it('si el usuario la toca, se corta ahí sin saltar y el giro vuelve con la rampa', () => {
    setup(false);
    run(1);
    run(30);
    expect(controls.introPlaying).toBe(true);
    const at = controls.yaw;
    pointer('pointerdown');
    pointer('pointerup');
    expect(controls.introPlaying).toBe(false);
    run(1);
    expect(controls.yaw - at).toBeCloseTo(rampAngle(1 / 60), 9);
  });

  it('se corta con las flechas', () => {
    setup(false);
    key('ArrowLeft');
    expect(controls.introPlaying).toBe(false);
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
  });
});
