import { type PerspectiveCamera, TOUCH, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createWheelGate } from './island-wheel-gate';

/** Zoom hacia fuera: hasta 4 veces la distancia del encuadre inicial; más lejos la isla casi no se ve. */
const MAX_DISTANCE_FACTOR = 4;
/** autoRotate: 0.6 equivale a una vuelta cada 100 s (60 / 0.6). */
const AUTO_ROTATE_SPEED = 0.6;
/** Animación de entrada: duración en segundos y vueltas completas de la cámara. */
export const INTRO_DURATION = 1.5;
const INTRO_TURNS = 2;
const UP = new Vector3(0, 1, 0);

/** Curva de frenado de la entrada: sale muy rápido y llega a 1 casi sin velocidad. */
export function easeOutCirc(x: number): number {
  return Math.sqrt(1 - (x - 1) ** 4);
}

/**
 * Ángulo (radianes, alrededor del eje Y) que le falta a la cámara para llegar
 * al encuadre inicial a los `elapsed` segundos de la entrada. Empieza en
 * `INTRO_TURNS` vueltas enteras (la misma vista que la imagen fija) y llega a 0
 * al terminar, en el mismo sentido que el autoRotate, que sigue sin salto.
 */
export function introAngle(elapsed: number): number {
  const progress = Math.min(Math.max(elapsed / INTRO_DURATION, 0), 1);
  return INTRO_TURNS * 2 * Math.PI * (1 - easeOutCirc(progress));
}

export interface IslandControls {
  /**
   * Fija el encuadre inicial (el estado al que vuelve `reset`) y los límites:
   * el target se aleja del centro como mucho `targetRadius`, y la cámara se
   * queda fuera de la esfera de radio `modelRadius` que envuelve la isla.
   * Sin reduced-motion, arranca la animación de entrada.
   */
  frame: (distance: number, targetRadius: number, modelRadius: number) => void;
  /** Para el bucle de render: la entrada, el damping y el giro automático (`delta` en segundos). */
  update: (delta: number) => void;
  /**
   * Devuelve cámara y target al encuadre inicial, sin la inercia del damping,
   * y reanuda el giro automático (salvo con reduced-motion). Lo disparan el
   * doble clic y la tecla R.
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
 * vertical como scroll y mandar `pointercancel` a OrbitControls. Un
 * `preventDefault` en el primer `touchmove` con dos dedos se lo impide; con un
 * dedo no se toca nada y la página se desplaza.
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
 * OrbitControls de la isla (BLOG-118, BLOG-119, BLOG-120).
 *
 * - Entrada: la cámara da dos vueltas rápidas que frenan en 1.5 s
 *   (`introAngle`), y después sigue el giro automático.
 * - Ratón: botón izquierdo gira, derecho mueve y la rueda hace zoom solo tras
 *   pulsar sobre la isla (`createWheelGate`).
 * - Táctil: un dedo desplaza la página; dos dedos giran y hacen zoom.
 * - Teclado: con el canvas enfocado, flechas para mover y Mayúsculas + flechas
 *   para girar (lo que trae OrbitControls), y R para restablecer.
 * - Doble clic: restablece la vista.
 * - Giro vertical completo (los ángulos polares por defecto) y zoom amplio,
 *   con topes solo para no atravesar la isla ni perderla de vista.
 * - Giro automático lento (`autoRotate`) que se detiene en cuanto el usuario
 *   interactúa (arrastre, pellizco, rueda o teclas) y solo vuelve con `reset`.
 *   Interactuar también corta la entrada.
 */
export function createIslandControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  { reducedMotion }: IslandControlsOptions,
): IslandControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  const gate = createWheelGate(canvas, (active) => {
    // Con `enableZoom` en false, OrbitControls sale de su listener de `wheel`
    // antes del `preventDefault`: la rueda desplaza la página.
    controls.enableZoom = active;
  });
  // OrbitControls mira `enableZoom` al recibir la rueda y, en táctil, al apoyar
  // el segundo dedo: el primero ya activó el gate, así que el pellizco hace zoom.

  controls.enableDamping = true;
  controls.cursorStyle = 'grab';
  // Un dedo: nada (la página hace scroll). Dos: zoom con pellizco y giro.
  controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
  // OrbitControls pone `touch-action: none` al conectarse; se sobrescribe
  // después para que un dedo en vertical desplace la página.
  canvas.style.touchAction = 'pan-y';
  const releaseMultiTouch = holdMultiTouch(canvas);
  controls.listenToKeyEvents(canvas);

  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.autoRotate = !reducedMotion.matches;
  // Entrada en curso: segundos transcurridos y posición de la cámara respecto
  // al target en el encuadre inicial. `undefined` cuando no hay entrada.
  let intro: { elapsed: number; offset: Vector3 } | undefined;
  const stopAutoRotate = () => {
    controls.autoRotate = false;
    intro = undefined;
  };

  const reset = () => {
    intro = undefined;
    // Sin damping, `update` aplica y vacía la inercia que quedara; luego
    // `reset` coloca la cámara sin que esa inercia la vuelva a mover.
    controls.enableDamping = false;
    controls.update();
    controls.reset();
    controls.enableDamping = true;
    controls.autoRotate = !reducedMotion.matches;
  };

  // `start` llega con el arrastre, el pellizco y la rueda; las flechas no lo
  // emiten, así que se escuchan aparte (Tab o Escape no paran el giro).
  const onKeyDown = (event: KeyboardEvent) => {
    if (isResetKey(event)) {
      event.preventDefault();
      reset();
    } else if (Object.values<string>(controls.keys).includes(event.code)) {
      stopAutoRotate();
    }
  };
  controls.addEventListener('start', stopAutoRotate);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('dblclick', reset);
  const onMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      stopAutoRotate();
    }
  };
  reducedMotion.addEventListener('change', onMotionChange);

  return {
    frame: (distance, targetRadius, modelRadius) => {
      controls.target.set(0, 0, 0);
      // Con el target a `targetRadius` del centro como mucho, a esta distancia
      // de él la cámara nunca entra en la esfera que envuelve la isla.
      controls.minDistance = Math.min(modelRadius + targetRadius, distance);
      controls.maxDistance = distance * MAX_DISTANCE_FACTOR;
      controls.maxTargetRadius = targetRadius;
      controls.update();
      controls.saveState();
      intro = reducedMotion.matches
        ? undefined
        : { elapsed: 0, offset: camera.position.clone().sub(controls.target) };
    },
    update: (delta) => {
      if (intro) {
        intro.elapsed += delta;
        if (intro.elapsed < INTRO_DURATION) {
          // La cámara gira alrededor del target sin pasar por OrbitControls:
          // así ni el damping ni el autoRotate se suman a la curva.
          camera.position
            .copy(intro.offset)
            .applyAxisAngle(UP, introAngle(intro.elapsed))
            .add(controls.target);
          camera.lookAt(controls.target);
          return;
        }
        intro = undefined;
      }
      controls.update(delta);
    },
    reset,
    get autoRotating() {
      return controls.autoRotate;
    },
    get introPlaying() {
      return intro !== undefined;
    },
    dispose: () => {
      controls.removeEventListener('start', stopAutoRotate);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('dblclick', reset);
      reducedMotion.removeEventListener('change', onMotionChange);
      releaseMultiTouch();
      gate.dispose();
      controls.dispose();
    },
  };
}
