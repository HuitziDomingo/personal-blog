import { Vector3 } from 'three';

/** Lo que el zoom necesita saber de la isla. */
export interface ZoomLimits {
  /** Distancia mínima de la cámara a un target, mirando desde `direction` (unitaria). */
  minDistanceAt: (target: Vector3, direction: Vector3) => number;
  /** Distancia máxima de la cámara al target (en el máximo, el target está en el centro). */
  maxDistance: number;
}

const eye = new Vector3();
const direction = new Vector3();
const nextTarget = new Vector3();

/**
 * Zoom hacia el puntero (BLOG-123). Modifica `camera` y `target` (posiciones).
 *
 * - Hacia dentro (`factor` < 1) con `anchor`, el punto del modelo bajo el
 *   puntero: cámara y target se acercan a él a la vez, en proporción
 *   (homotecia de centro `anchor`). La cámara no gira y el punto sigue en la
 *   misma recta desde la cámara, así que se queda quieto en la pantalla.
 * - Hacia dentro sin `anchor` (el puntero no está sobre la isla): la cámara se
 *   acerca al target, como siempre.
 * - En los dos casos, la cámara se para en `minDistanceAt` (la superficie del
 *   modelo más el margen, o el piso).
 * - Hacia fuera: la cámara se aleja del target y el target vuelve hacia el
 *   centro de la isla en proporción a lo que falta para el máximo; al llegar
 *   al máximo está en el centro. Así, alejarse siempre trae la isla de vuelta
 *   al cuadro, también después de moverla con el botón derecho (el pan no
 *   tiene límite).
 */
export function zoomToward(
  camera: Vector3,
  target: Vector3,
  anchor: Vector3 | undefined,
  factor: number,
  { minDistanceAt, maxDistance }: ZoomLimits,
): void {
  eye.subVectors(camera, target);
  const distance = eye.length();
  if (distance === 0 || factor === 1) {
    return;
  }
  direction.copy(eye).divideScalar(distance);

  if (factor < 1 && anchor) {
    let scale = factor;
    nextTarget.copy(target).sub(anchor).multiplyScalar(scale).add(anchor);
    const min = minDistanceAt(nextTarget, direction);
    if (distance * scale < min) {
      // Solo hasta el tope: más allá, el target seguiría hacia el punto con la cámara quieta.
      scale = min / distance;
      if (scale >= 1) {
        return;
      }
      nextTarget.copy(target).sub(anchor).multiplyScalar(scale).add(anchor);
    }
    camera.sub(anchor).multiplyScalar(scale).add(anchor);
    target.copy(nextTarget);
    return;
  }

  if (factor < 1) {
    const length = Math.max(distance * factor, minDistanceAt(target, direction));
    if (length < distance) {
      camera.copy(direction).multiplyScalar(length).add(target);
    }
    return;
  }

  // Hacia fuera: la fracción del camino hasta el máximo que se recorre es la
  // que el target recorre hacia el centro.
  const wanted = distance * factor;
  const room = maxDistance - distance;
  // Ya en el máximo no se mueve nada: el target no salta al centro de golpe
  // (si se movió con el botón derecho, se queda donde está hasta restablecer).
  if (room <= 0) {
    return;
  }
  const progress = Math.min((wanted - distance) / room, 1);
  target.multiplyScalar(1 - progress);
  const length = Math.min(wanted, maxDistance);
  camera.copy(direction).multiplyScalar(length).add(target);
}
