import { type PerspectiveCamera, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createWheelGate } from './island-wheel-gate';

/** Ángulo polar mínimo (desde arriba): la cámara no llega a mirar en vertical. */
const MIN_POLAR = (10 * Math.PI) / 180;
/** Ángulo polar máximo: la cámara se queda por encima del horizonte, sin ver la isla por debajo. */
const MAX_POLAR = (80 * Math.PI) / 180;
/** Zoom: de la mitad a 1.6 veces la distancia del encuadre inicial. */
const MIN_DISTANCE_FACTOR = 0.5;
const MAX_DISTANCE_FACTOR = 1.6;

export interface IslandControls {
  /** Fija el encuadre inicial: los límites y el estado al que vuelve `reset`. */
  frame: (distance: number, targetRadius: number) => void;
  /** Para el bucle de render: aplica el damping. */
  update: () => void;
  /** Devuelve cámara y target al encuadre inicial, sin la inercia del damping. */
  reset: () => void;
  dispose: () => void;
}

export interface IslandControlsOptions {
  /** Cuando la rueda pasa a hacer zoom o deja de hacerlo. */
  onWheelActiveChange: (active: boolean) => void;
  /** Mientras el usuario arrastra (de `start` a `end` de OrbitControls). */
  onInteractingChange: (interacting: boolean) => void;
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

/**
 * OrbitControls de la isla (BLOG-118).
 *
 * - Ratón: botón izquierdo gira, derecho mueve y la rueda hace zoom solo tras
 *   pulsar sobre la isla (`createWheelGate`).
 * - Táctil: un dedo desplaza la página; dos dedos giran y hacen zoom.
 * - Teclado: con el canvas enfocado, flechas para mover y Mayúsculas + flechas
 *   para girar (lo que trae OrbitControls).
 */
export function createIslandControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  { onWheelActiveChange, onInteractingChange }: IslandControlsOptions,
): IslandControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  const gate = createWheelGate(canvas, (active) => {
    // Con `enableZoom` en false, OrbitControls sale de su listener de `wheel`
    // antes del `preventDefault`: la rueda desplaza la página.
    controls.enableZoom = active;
    onWheelActiveChange(active);
  });
  // OrbitControls mira `enableZoom` al recibir la rueda y, en táctil, al apoyar
  // el segundo dedo: el primero ya activó el gate, así que el pellizco hace zoom.

  controls.enableDamping = true;
  controls.minPolarAngle = MIN_POLAR;
  controls.maxPolarAngle = MAX_POLAR;
  controls.cursorStyle = 'grab';
  // Un dedo: nada (la página hace scroll). Dos: zoom con pellizco y giro.
  controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
  // OrbitControls pone `touch-action: none` al conectarse; se sobrescribe
  // después para que un dedo en vertical desplace la página.
  canvas.style.touchAction = 'pan-y';
  const releaseMultiTouch = holdMultiTouch(canvas);
  controls.listenToKeyEvents(canvas);

  const onStart = () => {
    onInteractingChange(true);
  };
  const onEnd = () => {
    onInteractingChange(false);
  };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);

  return {
    frame: (distance, targetRadius) => {
      controls.target.set(0, 0, 0);
      controls.minDistance = distance * MIN_DISTANCE_FACTOR;
      controls.maxDistance = distance * MAX_DISTANCE_FACTOR;
      controls.maxTargetRadius = targetRadius;
      controls.update();
      controls.saveState();
    },
    update: () => {
      controls.update();
    },
    reset: () => {
      // Sin damping, `update` aplica y vacía la inercia que quedara; luego
      // `reset` coloca la cámara sin que esa inercia la vuelva a mover.
      controls.enableDamping = false;
      controls.update();
      controls.reset();
      controls.enableDamping = true;
    },
    dispose: () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      releaseMultiTouch();
      gate.dispose();
      controls.dispose();
    },
  };
}
