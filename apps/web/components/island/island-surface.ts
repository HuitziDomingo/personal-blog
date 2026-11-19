import { type Camera, type Object3D, Raycaster, type Vector2, Vector3 } from 'three';

/**
 * Distancia desde `origin` hasta la superficie más exterior del modelo en la
 * dirección `direction` (unitaria), o 0 si en esa dirección no hay modelo.
 */
export type SurfaceProbe = (origin: Vector3, direction: Vector3) => number;

/**
 * Sonda del tope de zoom de la isla (BLOG-123).
 *
 * Lanza un rayo desde fuera del modelo (a `radius` del centro, más lo que el
 * target se haya alejado de él) hacia el target, y se queda con el PRIMER
 * impacto: la cara más exterior del modelo en esa dirección. La cámara tiene
 * que quedar más lejos que ese punto.
 *
 * Por qué el impacto más exterior y no el más cercano al target: el target
 * suele estar dentro del castillo (es el centro de la isla). Desde dentro, el
 * primer impacto sería una pared interior, y una cámara colocada justo después
 * quedaría atrapada entre muros; con el más exterior siempre queda fuera, en
 * cualquier dirección del giro libre.
 */
export function createSurfaceProbe(root: Object3D, radius: number): SurfaceProbe {
  const raycaster = new Raycaster();
  const start = new Vector3();
  const inward = new Vector3();
  return (origin, direction) => {
    // Desde una esfera que envuelve todo el modelo aunque el target se mueva.
    const reach = radius + origin.length();
    start.copy(direction).multiplyScalar(reach).add(origin);
    inward.copy(direction).negate();
    raycaster.set(start, inward);
    // Solo lo que hay entre la esfera y el target, no lo de detrás.
    raycaster.far = reach;
    const [hit] = raycaster.intersectObject(root, true);
    return hit ? reach - hit.distance : 0;
  };
}

/**
 * Punto del modelo bajo el puntero, con `ndc` en coordenadas normalizadas del
 * canvas (−1 a 1, y hacia arriba), o `undefined` si el puntero no está sobre la isla.
 */
export type PointPicker = (ndc: Vector2) => Vector3 | undefined;

/** Picker del zoom hacia el puntero: raycast desde la cámara. */
export function createPointPicker(root: Object3D, camera: Camera): PointPicker {
  const raycaster = new Raycaster();
  return (ndc) => {
    // La cámara pudo moverse desde el último render (gestos, teclas).
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const [hit] = raycaster.intersectObject(root, true);
    return hit?.point.clone();
  };
}
