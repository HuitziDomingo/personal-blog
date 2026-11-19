import { type PerspectiveCamera, Quaternion, Vector2, Vector3 } from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

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
/** Velocidad del arrastre (TrackballControls trae 1): media anchura del canvas ≈ 170°. */
export const ROTATE_SPEED = 3;
/** Velocidad del arrastre con el botón derecho (TrackballControls trae 0.3). */
export const PAN_SPEED = 0.6;
/** Giro automático: una vuelta cada 100 s, en radianes por segundo. */
export const AUTO_ROTATE_SPEED = (2 * Math.PI) / 100;
/** Animación de entrada: duración en segundos y vueltas de más sobre el giro automático. */
export const INTRO_DURATION = 1.5;
export const INTRO_TURNS = 2;
/** Flechas: ángulo por pulsación y, con Mayúsculas, fracción de la distancia que se mueve la vista. */
export const KEY_ROTATE_ANGLE = Math.PI / 12;
export const KEY_PAN_STEP = 0.05;

/** Tope por cuadro (s) del giro automático: tras una pausa larga no salta. */
const MAX_FRAME_DELTA = 0.1;
/** Eje del giro automático y de la entrada: la vertical del mundo, no la de la cámara. */
const WORLD_UP = new Vector3(0, 1, 0);
/** Un código de tecla que no existe: desactiva las teclas A, S y D de TrackballControls. */
const NO_KEY = 'IslandNoKey';
const ARROWS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
/** Píxeles por unidad de `deltaY` según `deltaMode`: píxeles, líneas y páginas. */
const WHEEL_PIXELS = [1, 33, 800] as const;

/** Curva de frenado de la entrada: sale con velocidad 3 y llega con velocidad 0. */
export function easeOutCubic(u: number): number {
  return 1 - (1 - u) ** 3;
}

/**
 * Ángulo (radianes, alrededor de la vertical) que lleva girado la cámara a
 * los `elapsed` segundos de la entrada:
 *
 *   θ(t) = ω·T·u + A·ease(u),   u = t / T
 *
 * con ω la velocidad del giro automático, T la duración y A las vueltas de
 * más. Como `ease'(1) = 0`, la velocidad al terminar es exactamente ω y el
 * giro automático sigue sin escalón. Con t = 0 vale 0: la vista de la imagen fija.
 */
export function introAngle(elapsed: number): number {
  const u = Math.min(Math.max(elapsed / INTRO_DURATION, 0), 1);
  return AUTO_ROTATE_SPEED * INTRO_DURATION * u + INTRO_TURNS * 2 * Math.PI * easeOutCubic(u);
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

/** Distancia mínima de la cámara al target, con `surface` la de la superficie en esa dirección. */
export function minCameraDistance(surface: number, { minDistance, margin }: IslandRange): number {
  return surface > 0 ? Math.max(minDistance, surface + margin) : minDistance;
}

export interface IslandFrame {
  /** Distancia de la cámara en el encuadre inicial. */
  distance: number;
  /** Radio de la esfera que envuelve la isla; el target no sale de ella. */
  modelRadius: number;
  /** Superficie del modelo en cada dirección (`createSurfaceProbe`). */
  surface: SurfaceProbe;
  /** Punto del modelo bajo el puntero (`createPointPicker`), para el zoom hacia el puntero. */
  pick: PointPicker;
}

export interface IslandControls {
  /**
   * Fija el encuadre inicial (el estado al que vuelve `reset`) y los topes.
   * Sin reduced-motion, arranca la animación de entrada en el siguiente `update`.
   */
  frame: (framing: IslandFrame) => void;
  /** Para el bucle de render, con `performance.now()`: entrada, giro automático, inercia y topes. */
  update: (now: number) => void;
  /**
   * Devuelve cámara (posición y vertical) y target al encuadre inicial, sin
   * inercia, y reanuda el giro automático (salvo con reduced-motion). Lo
   * disparan el doble clic y la tecla R.
   */
  reset: () => void;
  /** Si la cámara gira sola ahora mismo. */
  readonly autoRotating: boolean;
  /** Si la animación de entrada sigue en curso. */
  readonly introPlaying: boolean;
  dispose: () => void;
}

export interface IslandControlsOptions {
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

/** Lo único de TrackballControls fuera de su API pública que se toca: la inercia del giro. */
interface TrackballInertia {
  _lastAngle: number;
}

/**
 * Controles de la isla con TrackballControls (BLOG-118, BLOG-120, BLOG-123).
 *
 * - Giro libre en cualquier eje, polos incluidos: la vertical de la cámara
 *   gira con ella.
 * - Ratón: botón izquierdo gira, derecho mueve y la rueda hace zoom solo tras
 *   pulsar sobre la isla (`createWheelGate`).
 * - Táctil: un dedo desplaza la página; dos dedos giran (arrastrando) y hacen
 *   zoom (pellizcando). Lo hace este módulo: TrackballControls no ve los
 *   toques, porque con un dedo giraría y no dejaría desplazar la página.
 * - Teclado, con el canvas enfocado: flechas para girar, Mayúsculas + flechas
 *   para mover y R para restablecer.
 * - Doble clic: restablece la vista.
 * - Zoom hacia el punto de la isla bajo el puntero (o el centro de los dos
 *   dedos), con `zoomToward`: hasta `MAX_DISTANCE_FACTOR` veces el encuadre
 *   y, de cerca, hasta la superficie del modelo en la dirección de la cámara
 *   (`SurfaceProbe`). TrackballControls no hace zoom.
 * - Entrada (`introAngle`) y giro automático lento, hechos a mano: se detienen
 *   en cuanto el usuario interactúa y solo vuelven con `reset`.
 */
export function createIslandControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  { reducedMotion }: IslandControlsOptions,
): IslandControls {
  // Sin elemento: así los listeners de este módulo se registran antes que los
  // de TrackballControls y pueden quedarse con los toques y la rueda.
  const controls = new TrackballControls(camera);
  controls.rotateSpeed = ROTATE_SPEED;
  controls.panSpeed = PAN_SPEED;
  // El zoom es de este módulo (hacia el puntero); con `noPan` en false,
  // TrackballControls sigue aplicando sus topes de distancia al mover.
  controls.noZoom = true;
  // TrackballControls escucha A, S y D en `window` (en toda la página) para
  // cambiar de modo; con un código que no existe, nunca hacen nada.
  controls.keys = [NO_KEY, NO_KEY, NO_KEY];

  const target = controls.target;
  let range: IslandRange = islandRange(1, 1);
  let modelRadius = 0;
  let surface: SurfaceProbe = () => 0;
  let pick: PointPicker = () => undefined;
  // Zoom de la rueda que falta por aplicar (logaritmo del factor) y su punto de anclaje.
  let pendingZoom: { log: number; anchor: Vector3 | undefined } | undefined;
  const home = { position: new Vector3(), up: new Vector3(0, 1, 0), target: new Vector3() };
  let autoRotate = !reducedMotion.matches;
  // Entrada: instante de inicio (el primer `update`) y posición de partida.
  let intro: { start: number | undefined; offset: Vector3 } | undefined;
  let last: number | undefined;

  // Toques activos sobre el canvas y el último centro y separación de los dos primeros.
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { x: number; y: number; spread: number } | undefined;

  const eye = new Vector3();
  const axis = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  const rotation = new Quaternion();

  const stopMotion = () => {
    autoRotate = false;
    intro = undefined;
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

  /** Gira la cámara (posición y vertical) alrededor del target. */
  const turn = (rotationAxis: Vector3, angle: number) => {
    rotation.setFromAxisAngle(rotationAxis, angle);
    eye.subVectors(camera.position, target).applyQuaternion(rotation);
    camera.up.applyQuaternion(rotation);
    camera.position.addVectors(target, eye);
    camera.lookAt(target);
  };

  /** Como un arrastre de TrackballControls en la dirección (x, y) de la pantalla, con y hacia arriba. */
  const drag = (x: number, y: number, angle: number) => {
    eye.subVectors(camera.position, target);
    up.copy(camera.up).normalize().multiplyScalar(y);
    side.crossVectors(camera.up, eye).normalize().multiplyScalar(x);
    axis.crossVectors(up.add(side), eye).normalize();
    if (axis.lengthSq() > 0) {
      turn(axis, angle);
    }
  };

  /** Mueve cámara y target juntos, en el plano de la pantalla. */
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

  /**
   * Topes: el target, dentro de la esfera de la isla; la cámara, fuera del
   * modelo y a no más del máximo del centro.
   */
  const clamp = () => {
    if (target.length() > modelRadius) {
      side.copy(target).setLength(modelRadius).sub(target);
      target.add(side);
      camera.position.add(side);
    }
    eye.subVectors(camera.position, target);
    const length = eye.length();
    // La sonda (un raycast) solo hace falta dentro de la esfera que envuelve
    // la isla (desde el target): fuera de ella no hay superficie más lejos.
    const min =
      length < modelRadius + target.length() + range.margin
        ? minDistanceAt(target, axis.copy(eye).normalize())
        : range.minDistance;
    // El máximo se mide desde el centro: con el target movido, desde él queda algo menos.
    const clamped = Math.min(Math.max(length, min), Math.max(range.maxDistance - target.length(), min));
    if (clamped !== length) {
      camera.position.addVectors(target, eye.setLength(clamped));
      camera.lookAt(target);
    }
  };

  const reset = () => {
    intro = undefined;
    // Un `update` sin inercia aplica y vacía lo pendiente (arrastre, rueda,
    // movimiento); el giro que seguiría por inercia se borra a mano.
    controls.staticMoving = true;
    controls.update();
    controls.staticMoving = false;
    (controls as unknown as TrackballInertia)._lastAngle = 0;
    touches.clear();
    pinch = undefined;
    pendingZoom = undefined;
    target.copy(home.target);
    camera.position.copy(home.position);
    camera.up.copy(home.up);
    camera.lookAt(target);
    autoRotate = !reducedMotion.matches;
  };

  // --- Rueda: solo después de un clic sobre la isla ----------------------------

  const gate = createWheelGate(canvas, () => undefined);
  const onWheel = (event: WheelEvent) => {
    // Sin el gate activo no hay `preventDefault`: la página se desplaza.
    if (!gate.active) {
      return;
    }
    event.preventDefault();
    stopMotion();
    const pixels = event.deltaY * (WHEEL_PIXELS[event.deltaMode] ?? 1);
    // Hacia dentro, hacia el punto bajo el puntero; hacia fuera, `zoomToward` usa el target.
    const anchor = pixels < 0 ? pickAt(event.clientX, event.clientY) : undefined;
    pendingZoom = { log: (pendingZoom?.log ?? 0) + pixels * ZOOM_SPEED, anchor };
  };

  // --- Toques: dos dedos giran y pellizcan ---------------------------------------

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
    // El canvas pudo moverse en la página desde la última vez (fuentes,
    // imágenes): TrackballControls mide el arrastre respecto a su caja.
    controls.handleResize();
    if (event.pointerType !== 'touch') {
      return;
    }
    event.stopImmediatePropagation();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      stopMotion();
    }
    pinch = measure();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) {
      return;
    }
    event.stopImmediatePropagation();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = measure();
    if (pinch && next) {
      // Mismas unidades que TrackballControls: media anchura del canvas es 1.
      const half = Math.max(canvas.clientWidth, 1) / 2;
      const x = (next.x - pinch.x) / half;
      const y = (pinch.y - next.y) / half;
      drag(x, y, Math.hypot(x, y) * ROTATE_SPEED);
      if (next.spread > 0 && next.spread !== pinch.spread) {
        // Hacia el punto de la isla entre los dos dedos.
        const factor = pinch.spread / next.spread;
        zoom(factor < 1 ? pickAt(next.x, next.y) : undefined, factor);
      }
    }
    pinch = next;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return;
    }
    event.stopImmediatePropagation();
    touches.delete(event.pointerId);
    pinch = measure();
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
    stopMotion();
    const x = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
    const y = event.code === 'ArrowUp' ? 1 : event.code === 'ArrowDown' ? -1 : 0;
    if (event.shiftKey) {
      // Mover la vista a la derecha deja la isla a la izquierda: va al revés que la flecha.
      pan(-x * KEY_PAN_STEP, -y * KEY_PAN_STEP);
    } else {
      // ↑ sube la cámara (la isla, vista desde arriba): al revés que arrastrar hacia arriba.
      drag(x, -y, KEY_ROTATE_ANGLE);
    }
  };

  const onStart = () => {
    stopMotion();
    // Un arrastre cambia la vista: el zoom pendiente ya no va hacia el mismo punto.
    pendingZoom = undefined;
    canvas.style.cursor = 'grabbing';
  };
  const onEnd = () => {
    canvas.style.cursor = 'grab';
  };
  const onMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      stopMotion();
    }
  };

  // En captura y antes de `connect`: llegan antes que los de TrackballControls.
  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove, true);
  canvas.addEventListener('pointerup', onPointerUp, true);
  canvas.addEventListener('pointercancel', onPointerUp, true);
  canvas.addEventListener('wheel', onWheel, true);
  controls.connect(canvas);
  controls.handleResize();
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
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
      controls.minDistance = range.minDistance;
      controls.maxDistance = range.maxDistance;
      target.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      home.position.copy(camera.position);
      home.up.copy(camera.up);
      home.target.copy(target);
      controls.update();
      autoRotate = !reducedMotion.matches;
      intro = autoRotate ? { start: undefined, offset: camera.position.clone() } : undefined;
      last = undefined;
    },
    update: (now) => {
      const delta = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_DELTA);
      last = now;
      if (intro) {
        intro.start ??= now;
        const elapsed = (now - intro.start) / 1000;
        // La cámara gira alrededor del target sin pasar por TrackballControls,
        // en sentido negativo como el giro automático.
        camera.position.copy(intro.offset).applyAxisAngle(WORLD_UP, -introAngle(elapsed)).add(target);
        camera.lookAt(target);
        if (elapsed < INTRO_DURATION) {
          return;
        }
        // Lo que pasó del final en este cuadro ya es giro automático: sin escalón.
        intro = undefined;
        turn(WORLD_UP, -AUTO_ROTATE_SPEED * (elapsed - INTRO_DURATION));
      } else if (autoRotate) {
        turn(WORLD_UP, -AUTO_ROTATE_SPEED * delta);
      }
      if (pendingZoom) {
        // Una fracción de lo pendiente en cada cuadro, según el tiempo: suave y sin depender del frame rate.
        const step = Math.abs(pendingZoom.log) < 1e-4 ? pendingZoom.log : pendingZoom.log * (1 - Math.exp(-delta / ZOOM_SMOOTHING));
        zoom(pendingZoom.anchor, Math.exp(step));
        pendingZoom.log -= step;
        if (pendingZoom.log === 0) {
          pendingZoom = undefined;
        }
      }
      controls.update();
      clamp();
    },
    reset,
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
      canvas.removeEventListener('wheel', onWheel, true);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('dblclick', reset);
      reducedMotion.removeEventListener('change', onMotionChange);
      releaseMultiTouch();
      gate.dispose();
      controls.dispose();
      canvas.style.touchAction = '';
      canvas.style.cursor = '';
    },
  };
}
