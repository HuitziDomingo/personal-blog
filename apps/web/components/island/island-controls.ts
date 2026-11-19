import { Euler, type Object3D, type PerspectiveCamera, Vector2, Vector3 } from 'three';

import type { PointPicker, SurfaceProbe } from './island-surface';
import { createWheelGate } from './island-wheel-gate';
import { zoomToward } from './island-zoom';

// Constantes con nombre para ajustarlas mirando las capturas (BLOG-123).

/** Zoom hacia fuera: la cámara, hasta 6 veces la distancia del encuadre inicial al centro de la isla. */
export const MAX_DISTANCE_FACTOR = 6;
/**
 * Zoom hacia dentro: la cámara se queda a este margen (en radios de la isla)
 * de la superficie más exterior del modelo en su dirección…
 */
export const SURFACE_MARGIN_FACTOR = 0.2;
/** …y nunca más cerca del target que este piso (en radios de la isla). */
export const MIN_DISTANCE_FLOOR_FACTOR = 0.25;
/** Plano cercano de la cámara (en radios de la isla): menor que el margen, para no recortar de cerca. */
export const NEAR_FACTOR = 0.01;
/**
 * Velocidad de la rueda: logaritmo del factor de zoom por píxel de `deltaY`.
 * Un paso de rueda (100 px) acerca un 26 % y aleja un 35 %.
 */
export const ZOOM_SPEED = 0.003;
/** Suavizado de la rueda: el zoom pendiente se aplica con esta constante de tiempo (s). */
export const ZOOM_SMOOTHING = 0.08;
/** Velocidad del arrastre: radianes por media anchura del canvas (≈ 170°), como antes. */
export const ROTATE_SPEED = 3;
/**
 * Velocidad del pan con el botón derecho (BLOG-128). Conserva la sensación
 * de antes: TrackballControls movía `PAN_SPEED` veces la distancia por
 * ancho de canvas y su inercia (amortiguación 0.2) lo multiplicaba por 5;
 * aquí se aplica de una vez, `PAN_SPEED / 0.2`. Solo el ratón: dos dedos giran
 * y hacen zoom, y Mayúsculas + flechas usan `KEY_PAN_STEP`.
 */
export const PAN_SPEED = 0.3;
/** Inercia del giro tras soltar: la velocidad cae a 1/e en estos segundos (como la de TrackballControls a 60 fps). */
export const INERTIA_TIME = 0.15;
/** Giro automático: segundos por vuelta (BLOG-126: 80 s, un 25 % más rápido que los 100 s de antes). */
export const AUTO_ROTATE_PERIOD = 80;
/** Giro automático en radianes por segundo; la entrada termina a esta misma velocidad. */
export const AUTO_ROTATE_SPEED = (2 * Math.PI) / AUTO_ROTATE_PERIOD;
/** Tras soltar un arrastre, segundos que tarda el giro automático en recuperar su velocidad (BLOG-127). */
export const AUTO_ROTATE_RAMP = 0.5;
/**
 * Animación de entrada, como el perro de la web anterior (`voxel-dog.js`):
 * 10 vueltas (20π) con `easeOutCirc` en 100 cuadros a 60 fps (1.67 s), aquí
 * medidos con el reloj. Son vueltas de más sobre el giro automático.
 */
export const INTRO_DURATION = 100 / 60;
export const INTRO_TURNS = 10;
/** Flechas: ángulo por pulsación y, con Mayúsculas, fracción de la distancia que se mueve la vista. */
export const KEY_ROTATE_ANGLE = Math.PI / 12;
export const KEY_PAN_STEP = 0.05;

/** Tope por cuadro (s) del giro automático: tras una pausa larga no salta. */
const MAX_FRAME_DELTA = 0.1;
/** Ganancia del pan: lo que antes sumaba la inercia de TrackballControls (1 / 0.2). */
const PAN_GAIN = 1 / 0.2;
/** Por debajo de esta velocidad (rad/s) la inercia se da por terminada. */
const INERTIA_STOP = 1e-4;
const ARROWS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
/** Píxeles que tiene que moverse el centro de dos dedos, desde que se apoyaron, para contar como arrastre. */
const TOUCH_DRAG_THRESHOLD = 12;
/** Píxeles por unidad de `deltaY` según `deltaMode`: píxeles, líneas y páginas. */
const WHEEL_PIXELS = [1, 33, 800] as const;

/**
 * Ángulo (radianes) que gira el giro automático en los primeros `elapsed`
 * segundos tras soltar un arrastre. La velocidad sube de 0 a ω con
 * `smoothstep` en `AUTO_ROTATE_RAMP` segundos, así que es continua (sin tirón)
 * y llega a ω con aceleración 0. Esta es su integral:
 *
 *   v(t) = ω·s(t/R),  s(x) = 3x² − 2x³
 *   θ(t) = ω·R·(x³ − x⁴/2) mientras t < R,  y después ω·R/2 + ω·(t − R)
 */
export function rampAngle(elapsed: number): number {
  if (elapsed <= 0) {
    return 0;
  }
  if (elapsed >= AUTO_ROTATE_RAMP) {
    return AUTO_ROTATE_SPEED * (AUTO_ROTATE_RAMP / 2 + elapsed - AUTO_ROTATE_RAMP);
  }
  const x = elapsed / AUTO_ROTATE_RAMP;
  return AUTO_ROTATE_SPEED * AUTO_ROTATE_RAMP * (x ** 3 - x ** 4 / 2);
}

/** Curva de frenado del perro: sale disparada y llega a 1 con velocidad 0. */
export function easeOutCirc(u: number): number {
  return Math.sqrt(1 - (u - 1) ** 4);
}

/**
 * Ángulo (radianes) que la entrada suma al yaw de la isla a los `elapsed`
 * segundos:
 *
 *   θ(t) = ω·T·u + A·ease(u),   u = t / T
 *
 * con ω la velocidad del giro automático, T la duración y A las vueltas de
 * más. Como `ease'(1) = 0`, la velocidad al terminar es exactamente ω y el
 * giro automático sigue sin escalón. Con t = 0 vale 0: la vista de la imagen fija.
 */
export function introAngle(elapsed: number): number {
  const u = Math.min(Math.max(elapsed / INTRO_DURATION, 0), 1);
  return AUTO_ROTATE_SPEED * INTRO_DURATION * u + INTRO_TURNS * 2 * Math.PI * easeOutCirc(u);
}

/** Planos de la cámara y topes de distancia, a partir del encuadre inicial. */
export interface IslandRange {
  near: number;
  far: number;
  /** Piso: la cámara nunca está más cerca del target. */
  minDistance: number;
  maxDistance: number;
  /** Margen sobre la superficie del modelo. */
  margin: number;
}

export function islandRange(distance: number, modelRadius: number): IslandRange {
  const maxDistance = distance * MAX_DISTANCE_FACTOR;
  return {
    near: modelRadius * NEAR_FACTOR,
    // Desde el máximo de zoom, la cara de atrás de la isla (con el target movido) sigue dentro.
    far: maxDistance + modelRadius * 3,
    minDistance: Math.min(modelRadius * MIN_DISTANCE_FLOOR_FACTOR, distance),
    maxDistance,
    margin: modelRadius * SURFACE_MARGIN_FACTOR,
  };
}

/**
 * Orientación de la isla: primero el yaw alrededor de su eje vertical y
 * después el pitch alrededor del eje X del mundo (el horizontal de la
 * pantalla). En matrices, R = Rx(pitch)·Ry(yaw): el orden `XYZ` de three.js.
 * Se calcula desde cero en cada cuadro, sin acumular giros, así que el eje
 * vertical de la isla siempre queda en el plano vertical de la cámara: nunca
 * se inclina hacia un lado (sin roll).
 */
export function islandOrientation(yaw: number, pitch: number, target = new Euler()): Euler {
  return target.set(pitch, yaw, 0, 'XYZ');
}

/**
 * Signo del arrastre horizontal sobre el yaw: con la isla boca abajo, su eje
 * vertical apunta hacia abajo en pantalla y el mismo yaw la haría girar al
 * revés de la mano; se invierte para que siempre siga a la mano.
 *
 * «Boca abajo» se mide contra la cámara: el eje vertical de la isla
 * (`modelUp`, en el mundo) frente al «arriba» de la pantalla (`screenUp`).
 * Con la cámara a nivel es exactamente cos(pitch) < 0; con la cámara 25° por
 * encima, la cara de delante empieza a ir al revés a los 65° de pitch, no a
 * los 90°, y así el cambio cae justo donde se nota.
 */
export function yawDragSign(modelUp: Vector3, screenUp: Vector3): 1 | -1 {
  return modelUp.dot(screenUp) < 0 ? -1 : 1;
}

/** Distancia mínima de la cámara al target, con `surface` la de la superficie en esa dirección. */
export function minCameraDistance(surface: number, { minDistance, margin }: IslandRange): number {
  return surface > 0 ? Math.max(minDistance, surface + margin) : minDistance;
}

export interface IslandFrame {
  /** Distancia de la cámara en el encuadre inicial. */
  distance: number;
  /** Yaw inicial de la isla (la vista de la imagen fija). */
  yaw: number;
  /** Radio de la esfera que envuelve la isla. */
  modelRadius: number;
  /** Superficie del modelo en cada dirección (`createSurfaceProbe`). */
  surface: SurfaceProbe;
  /** Punto del modelo bajo el puntero (`createPointPicker`), para el zoom hacia el puntero. */
  pick: PointPicker;
}

export interface IslandControls {
  /**
   * Fija el encuadre inicial (el estado al que vuelve `reset`) y los topes.
   * Sin reduced-motion, deja la animación de entrada lista: la cámara se
   * queda en el encuadre hasta `play`.
   */
  frame: (framing: IslandFrame) => void;
  /** Arranca la entrada en el siguiente `update`: cuando la isla ya se ve. */
  play: () => void;
  /** Para el bucle de render, con `performance.now()`: entrada, giro automático, inercia y topes. */
  update: (now: number) => void;
  /**
   * Devuelve yaw, pitch, pan y zoom a los iniciales, sin inercia. El giro
   * automático sigue. Lo disparan el doble clic y la tecla R.
   */
  reset: () => void;
  /** Ángulos actuales de la isla, en radianes. */
  readonly yaw: number;
  readonly pitch: number;
  /** Si la isla gira sola: siempre, salvo con reduced-motion. */
  readonly autoRotating: boolean;
  /** Si la animación de entrada sigue en curso. */
  readonly introPlaying: boolean;
  dispose: () => void;
}

export interface IslandControlsOptions {
  /** El objeto que gira (el pivote del modelo): su orientación es `islandOrientation(yaw, pitch)`. */
  model: Object3D;
  /**
   * `prefers-reduced-motion: reduce`. Si coincide, o pasa a coincidir con la
   * isla ya cargada, la cámara no gira sola, ni siquiera tras restablecer,
   * y no hay animación de entrada.
   */
  reducedMotion: MotionQuery;
}

/** Lo que se usa de un `MediaQueryList`: los tests le pasan uno falso. */
export interface MotionQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void;
}

/**
 * Bloquea el scroll de la página solo con dos dedos o más sobre el canvas.
 *
 * Con `touch-action: pan-y`, el navegador puede tomar un gesto de dos dedos en
 * vertical como scroll y mandar `pointercancel`. Un `preventDefault` en el
 * primer `touchmove` con dos dedos se lo impide; con un dedo no se toca nada y
 * la página se desplaza.
 */
function holdMultiTouch(canvas: HTMLCanvasElement): () => void {
  const onTouch = (event: TouchEvent) => {
    if (event.touches.length > 1 && event.cancelable) {
      event.preventDefault();
    }
  };
  canvas.addEventListener('touchstart', onTouch, { passive: false });
  canvas.addEventListener('touchmove', onTouch, { passive: false });
  return () => {
    canvas.removeEventListener('touchstart', onTouch);
    canvas.removeEventListener('touchmove', onTouch);
  };
}

/** R sin modificadores: Ctrl+R o Cmd+R siguen recargando la página. */
function isResetKey(event: KeyboardEvent): boolean {
  return event.code === 'KeyR' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Controles de la isla: tornamesa sobre el modelo (BLOG-129).
 *
 * La cámara no gira: el modelo tiene dos ángulos independientes, yaw y pitch,
 * y su orientación se recalcula en cada cuadro con `islandOrientation`.
 * - Ratón: el botón izquierdo gira (horizontal → yaw, vertical → pitch, sin
 *   límite), el derecho mueve (pan sin límite) y la rueda hace zoom hacia el
 *   punto bajo el puntero, solo tras pulsar sobre la isla (`createWheelGate`).
 * - Táctil: un dedo desplaza la página; dos dedos giran (arrastrando el
 *   centro) y hacen zoom (pellizcando).
 * - Teclado, con el canvas enfocado: flechas para girar (↑ muestra la isla
 *   desde arriba), Mayúsculas + flechas para mover y R para restablecer.
 * - Doble clic: restablece la vista.
 * - Zoom: hasta `MAX_DISTANCE_FACTOR` veces el encuadre y, de cerca, hasta la
 *   superficie del modelo girado en la dirección de la cámara (`SurfaceProbe`).
 * - Entrada (`introAngle`) y giro automático lento, que suman al yaw. El giro
 *   se pausa mientras el usuario arrastra y vuelve con una rampa al soltar;
 *   tras un arrastre queda inercia en yaw y pitch, que decae con el tiempo.
 */
export function createIslandControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  { model, reducedMotion }: IslandControlsOptions,
): IslandControls {
  const target = new Vector3();
  let range: IslandRange = islandRange(1, 1);
  let modelRadius = 0;
  let surface: SurfaceProbe = () => 0;
  let pick: PointPicker = () => undefined;
  const home = { position: new Vector3(), target: new Vector3(), yaw: 0, pitch: 0 };
  let yaw = 0;
  let pitch = 0;
  // Inercia tras soltar un arrastre (rad/s) y la velocidad que llevaba el arrastre.
  const inertia = { yaw: 0, pitch: 0 };
  const dragVelocity = { yaw: 0, pitch: 0, at: undefined as number | undefined };
  // Zoom de la rueda que falta por aplicar (logaritmo del factor) y su punto de anclaje.
  let pendingZoom: { log: number; anchor: Vector3 | undefined } | undefined;
  let autoRotate = !reducedMotion.matches;
  // Entrada: si ya se pidió `play`, su instante de inicio (el primer `update`
  // después) y el yaw de partida.
  let intro: { playing: boolean; start: number | undefined; yaw: number } | undefined;
  let last: number | undefined;
  // Arrastre en curso: pausa el giro automático. Al soltar, `ramp` cuenta los
  // segundos de la rampa. `sign` es el signo del yaw, fijado al empezar.
  let dragging: { by: 'mouse' | 'touch'; mode: 'rotate' | 'pan'; x: number; y: number; sign: 1 | -1 } | undefined;
  let ramp: { elapsed: number } | undefined;
  // Toques activos sobre el canvas y el último centro y separación de los dos primeros.
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { x: number; y: number; spread: number } | undefined;
  // Centro y separación de los dos dedos al apoyarse, y el signo del yaw de ese gesto.
  let gesture: { x: number; y: number; spread: number; sign: 1 | -1 } | undefined;

  const eye = new Vector3();
  const axis = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  const orientation = new Euler();

  /** Aplica yaw y pitch al modelo, desde cero. */
  const orient = () => {
    model.rotation.copy(islandOrientation(yaw, pitch, orientation));
    model.updateMatrixWorld(true);
  };

  const stopIntro = () => {
    intro = undefined;
  };

  const modelUp = new Vector3();
  const screenUp = new Vector3();
  /** El signo del yaw ahora mismo (ver `yawDragSign`). */
  const currentYawSign = () => {
    modelUp.set(0, 1, 0).applyEuler(islandOrientation(yaw, pitch, orientation));
    camera.updateMatrixWorld();
    screenUp.setFromMatrixColumn(camera.matrixWorld, 1);
    return yawDragSign(modelUp, screenUp);
  };

  /** Ancho del canvas en píxeles, para pasar el arrastre a radianes. */
  const halfWidth = () => Math.max(canvas.clientWidth, 1) / 2;

  /** Gira la isla por un arrastre de (dx, dy) píxeles, con el signo del yaw de ese arrastre. */
  const rotateBy = (dx: number, dy: number, sign: 1 | -1, now: number | undefined) => {
    const dYaw = (sign * dx * ROTATE_SPEED) / halfWidth();
    const dPitch = (dy * ROTATE_SPEED) / halfWidth();
    yaw += dYaw;
    pitch += dPitch;
    // Velocidad del arrastre para la inercia: media móvil sobre el tiempo entre eventos.
    if (now !== undefined) {
      const dt = dragVelocity.at === undefined ? 0 : (now - dragVelocity.at) / 1000;
      if (dt > 0) {
        const keep = Math.exp(-dt / 0.05);
        dragVelocity.yaw = dragVelocity.yaw * keep + (dYaw / dt) * (1 - keep);
        dragVelocity.pitch = dragVelocity.pitch * keep + (dPitch / dt) * (1 - keep);
      }
      dragVelocity.at = now;
    }
  };

  const minDistanceAt = (at: Vector3, direction: Vector3) => minCameraDistance(surface(at, direction), range);
  const ndc = new Vector2();
  /** Punto de la isla bajo una posición del puntero (coordenadas del viewport). */
  const pickAt = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return undefined;
    }
    ndc.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    return pick(ndc);
  };
  /** Zoom hacia `anchor` (o el target), con los topes de la isla. */
  const zoom = (anchor: Vector3 | undefined, factor: number) => {
    zoomToward(camera.position, target, anchor, factor, { minDistanceAt, maxDistance: range.maxDistance });
    camera.lookAt(target);
  };

  /** Mueve cámara y target juntos, en el plano de la pantalla (fracciones de la distancia). */
  const pan = (x: number, y: number) => {
    const distance = camera.position.distanceTo(target);
    camera.updateMatrix();
    side.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(x * distance);
    up.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(y * distance);
    side.add(up);
    camera.position.add(side);
    target.add(side);
    camera.lookAt(target);
  };

  /** Topes de la cámara: fuera del modelo (girado) y a no más del máximo del target. */
  const clamp = () => {
    eye.subVectors(camera.position, target);
    const length = eye.length();
    // La sonda (un raycast) solo hace falta dentro de la esfera que envuelve
    // la isla (desde el target): fuera de ella no hay superficie más lejos.
    const min =
      length < modelRadius + target.length() + range.margin
        ? minDistanceAt(target, axis.copy(eye).normalize())
        : range.minDistance;
    const clamped = Math.min(Math.max(length, min), range.maxDistance);
    if (clamped !== length) {
      camera.position.addVectors(target, eye.setLength(clamped));
      camera.lookAt(target);
    }
  };

  const pauseRotation = (state: NonNullable<typeof dragging>) => {
    dragging = state;
    ramp = undefined;
    inertia.yaw = 0;
    inertia.pitch = 0;
    dragVelocity.yaw = 0;
    dragVelocity.pitch = 0;
    dragVelocity.at = undefined;
  };
  const resumeRotation = (by: 'mouse' | 'touch', now: number | undefined) => {
    if (dragging?.by !== by) {
      return;
    }
    if (dragging.mode === 'rotate') {
      // Si el puntero llevaba un rato quieto, no queda inercia.
      const idle = now === undefined || dragVelocity.at === undefined ? 0 : (now - dragVelocity.at) / 1000;
      const keep = Math.exp(-idle / 0.05);
      inertia.yaw = dragVelocity.yaw * keep;
      inertia.pitch = dragVelocity.pitch * keep;
    }
    dragging = undefined;
    ramp = { elapsed: 0 };
  };

  const reset = () => {
    intro = undefined;
    inertia.yaw = 0;
    inertia.pitch = 0;
    pendingZoom = undefined;
    yaw = home.yaw;
    pitch = home.pitch;
    target.copy(home.target);
    camera.position.copy(home.position);
    camera.lookAt(target);
    orient();
  };

  // --- Rueda: solo después de un clic sobre la isla ----------------------------

  const gate = createWheelGate(canvas, () => undefined);
  const onWheel = (event: WheelEvent) => {
    // Sin el gate activo no hay `preventDefault`: la página se desplaza.
    if (!gate.active) {
      return;
    }
    event.preventDefault();
    stopIntro();
    const pixels = event.deltaY * (WHEEL_PIXELS[event.deltaMode] ?? 1);
    // Hacia dentro, hacia el punto bajo el puntero; hacia fuera, `zoomToward` usa el target.
    const anchor = pixels < 0 ? pickAt(event.clientX, event.clientY) : undefined;
    pendingZoom = { log: (pendingZoom?.log ?? 0) + pixels * ZOOM_SPEED, anchor };
  };

  // --- Puntero: ratón (girar y mover) y dos dedos (girar y pellizcar) -----------

  const measure = () => {
    const [first, second] = [...touches.values()];
    if (!first || !second) {
      return undefined;
    }
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      spread: Math.hypot(first.x - second.x, first.y - second.y),
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pinch = measure();
      if (touches.size === 2 && pinch) {
        stopIntro();
        // El signo del yaw se fija al empezar el gesto (ver `yawDragSign`).
        gesture = { ...pinch, sign: currentYawSign() };
      }
      return;
    }
    // Girar (izquierdo) o mover (derecho); el central solo activa la rueda.
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    event.preventDefault();
    stopIntro();
    pendingZoom = undefined;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    pauseRotation({
      by: 'mouse',
      mode: event.button === 0 ? 'rotate' : 'pan',
      x: event.clientX,
      y: event.clientY,
      // Fijo para todo el arrastre: si cruza los 90°, no cambia de sentido a mitad.
      sign: currentYawSign(),
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      if (!touches.has(event.pointerId)) {
        return;
      }
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = measure();
      if (pinch && next && gesture) {
        // Si el centro de los dos dedos se aleja de donde empezó, es un arrastre
        // (giro): pausa. Un pellizco no pausa, como la rueda. Cada dedo llega en
        // su propio evento, así que en un pellizco el centro se mueve como mucho
        // la mitad de lo que cambia la separación: eso no cuenta como arrastre.
        const moved = Math.hypot(next.x - gesture.x, next.y - gesture.y);
        if (dragging?.by !== 'touch' && moved > TOUCH_DRAG_THRESHOLD && moved > 0.75 * Math.abs(next.spread - gesture.spread)) {
          pauseRotation({ by: 'touch', mode: 'rotate', x: next.x, y: next.y, sign: gesture.sign });
        }
        rotateBy(next.x - pinch.x, next.y - pinch.y, gesture.sign, event.timeStamp);
        if (next.spread > 0 && next.spread !== pinch.spread) {
          // Hacia el punto de la isla entre los dos dedos.
          const factor = pinch.spread / next.spread;
          orient();
          zoom(factor < 1 ? pickAt(next.x, next.y) : undefined, factor);
        }
      }
      pinch = next;
      return;
    }
    if (dragging?.by !== 'mouse') {
      return;
    }
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    if (dragging.mode === 'rotate') {
      rotateBy(dx, dy, dragging.sign, event.timeStamp);
    } else {
      const box = canvas.getBoundingClientRect();
      pan((-dx / Math.max(box.width, 1)) * PAN_SPEED * PAN_GAIN, (dy / Math.max(box.height, 1)) * PAN_SPEED * PAN_GAIN);
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      pinch = measure();
      if (touches.size < 2) {
        gesture = undefined;
        resumeRotation('touch', event.timeStamp);
      }
      return;
    }
    if (dragging?.by === 'mouse') {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = 'grab';
      resumeRotation('mouse', event.timeStamp);
    }
  };

  const onContextMenu = (event: Event) => {
    // El botón derecho mueve la isla: sin menú contextual sobre el canvas.
    event.preventDefault();
  };

  // --- Teclado ---------------------------------------------------------------------

  const onKeyDown = (event: KeyboardEvent) => {
    if (isResetKey(event)) {
      event.preventDefault();
      reset();
      return;
    }
    if (!ARROWS.includes(event.code) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    event.preventDefault();
    stopIntro();
    const x = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
    const y = event.code === 'ArrowUp' ? 1 : event.code === 'ArrowDown' ? -1 : 0;
    if (event.shiftKey) {
      // Mover la vista a la derecha deja la isla a la izquierda: va al revés que la flecha.
      pan(-x * KEY_PAN_STEP, -y * KEY_PAN_STEP);
    } else {
      // → gira como arrastrar a la derecha (con el mismo signo boca abajo) y
      // ↑ inclina la cara de arriba hacia la cámara: la isla, vista desde arriba.
      yaw += currentYawSign() * x * KEY_ROTATE_ANGLE;
      pitch += y * KEY_ROTATE_ANGLE;
      orient();
    }
  };

  const onMotionChange = (event: MediaQueryListEvent) => {
    // Con reduced-motion en caliente la portada vuelve a la imagen fija; por si
    // la escena siguiera montada, aquí también se para todo.
    if (event.matches) {
      autoRotate = false;
      stopIntro();
    }
  };

  // Escuchados en captura: llegan antes que cualquier otro listener del canvas.
  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove, true);
  canvas.addEventListener('pointerup', onPointerUp, true);
  canvas.addEventListener('pointercancel', onPointerUp, true);
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  // Un dedo en vertical desplaza la página; los gestos de dos los toma `holdMultiTouch`.
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  const releaseMultiTouch = holdMultiTouch(canvas);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('dblclick', reset);
  reducedMotion.addEventListener('change', onMotionChange);

  return {
    frame: (framing) => {
      range = islandRange(framing.distance, framing.modelRadius);
      modelRadius = framing.modelRadius;
      surface = framing.surface;
      pick = framing.pick;
      target.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      yaw = framing.yaw;
      pitch = 0;
      home.position.copy(camera.position);
      home.target.copy(target);
      home.yaw = yaw;
      home.pitch = pitch;
      orient();
      autoRotate = !reducedMotion.matches;
      intro = autoRotate ? { playing: false, start: undefined, yaw } : undefined;
      last = undefined;
    },
    play: () => {
      if (intro) {
        intro.playing = true;
      }
    },
    update: (now) => {
      const delta = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_DELTA);
      last = now;
      if (intro && !intro.playing) {
        // Lista, pero la isla todavía no se ve: espera en el encuadre.
        return;
      }
      let autoAngle = AUTO_ROTATE_SPEED * delta;
      if (dragging) {
        autoAngle = 0;
      } else if (ramp) {
        // Lo que gira la rampa en este cuadro: la diferencia de su integral.
        const before = ramp.elapsed;
        ramp.elapsed += delta;
        autoAngle = rampAngle(ramp.elapsed) - rampAngle(before);
        if (ramp.elapsed >= AUTO_ROTATE_RAMP) {
          ramp = undefined;
        }
      }
      if (intro) {
        intro.start ??= now;
        const elapsed = (now - intro.start) / 1000;
        if (elapsed < INTRO_DURATION) {
          yaw = intro.yaw + introAngle(elapsed);
          orient();
          return;
        }
        // Lo que pasó del final en este cuadro ya es giro automático: sin escalón.
        yaw = intro.yaw + introAngle(INTRO_DURATION);
        autoAngle = AUTO_ROTATE_SPEED * (elapsed - INTRO_DURATION);
        intro = undefined;
      }
      // Inercia de un arrastre: decae con el tiempo, no por cuadro.
      if (!dragging && (inertia.yaw !== 0 || inertia.pitch !== 0)) {
        const keep = Math.exp(-delta / INERTIA_TIME);
        // Integral exacta de v·e^(−t/τ) en este cuadro.
        yaw += inertia.yaw * INERTIA_TIME * (1 - keep);
        pitch += inertia.pitch * INERTIA_TIME * (1 - keep);
        inertia.yaw *= keep;
        inertia.pitch *= keep;
        if (Math.hypot(inertia.yaw, inertia.pitch) < INERTIA_STOP) {
          inertia.yaw = 0;
          inertia.pitch = 0;
        }
      }
      // El giro automático suma al yaw, nunca se invierte.
      if (autoRotate) {
        yaw += autoAngle;
      }
      orient();
      if (pendingZoom) {
        // Una fracción de lo pendiente en cada cuadro, según el tiempo: suave y sin depender del frame rate.
        const step =
          Math.abs(pendingZoom.log) < 1e-4 ? pendingZoom.log : pendingZoom.log * (1 - Math.exp(-delta / ZOOM_SMOOTHING));
        zoom(pendingZoom.anchor, Math.exp(step));
        pendingZoom.log -= step;
        if (pendingZoom.log === 0) {
          pendingZoom = undefined;
        }
      }
      clamp();
    },
    reset,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get autoRotating() {
      return autoRotate;
    },
    get introPlaying() {
      return intro !== undefined;
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointermove', onPointerMove, true);
      canvas.removeEventListener('pointerup', onPointerUp, true);
      canvas.removeEventListener('pointercancel', onPointerUp, true);
      canvas.removeEventListener('wheel', onWheel, { capture: true });
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('dblclick', reset);
      reducedMotion.removeEventListener('change', onMotionChange);
      releaseMultiTouch();
      gate.dispose();
      canvas.style.touchAction = '';
      canvas.style.cursor = '';
    },
  };
}
