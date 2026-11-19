import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { zoomToward, type ZoomLimits } from './island-zoom';

const limits: ZoomLimits = { minDistanceAt: () => 1, maxDistance: 60 };

describe('zoomToward', () => {
  it('hacia dentro con ancla: cámara y target se acercan al punto en proporción y la dirección de mirada no cambia', () => {
    const camera = new Vector3(0, 0, 10);
    const target = new Vector3();
    const anchor = new Vector3(1, 1, 1);
    zoomToward(camera, target, anchor, 0.5, limits);
    expect(camera.toArray()).toEqual([0.5, 0.5, 5.5]);
    expect(target.toArray()).toEqual([0.5, 0.5, 0.5]);
    // El punto sigue en la misma recta desde la cámara que antes: quieto en pantalla.
    const before = anchor.clone().sub(new Vector3(0, 0, 10)).normalize();
    const after = anchor.clone().sub(camera).normalize();
    expect(after.distanceTo(before)).toBeLessThan(1e-12);
  });

  it('hacia dentro sin ancla: se acerca al target, que no se mueve', () => {
    const camera = new Vector3(0, 0, 10);
    const target = new Vector3();
    zoomToward(camera, target, undefined, 0.5, limits);
    expect(camera.toArray()).toEqual([0, 0, 5]);
    expect(target.toArray()).toEqual([0, 0, 0]);
  });

  it('se para en el tope, con o sin ancla, y en el tope no mueve nada más', () => {
    const camera = new Vector3(0, 0, 10);
    const target = new Vector3();
    zoomToward(camera, target, undefined, 0.01, limits);
    expect(camera.distanceTo(target)).toBeCloseTo(1);

    const withAnchor = new Vector3(0, 0, 10);
    const anchoredTarget = new Vector3();
    zoomToward(withAnchor, anchoredTarget, new Vector3(0.5, 0, 0), 0.01, limits);
    expect(withAnchor.distanceTo(anchoredTarget)).toBeCloseTo(1);
    const reached = withAnchor.clone();
    zoomToward(withAnchor, anchoredTarget, new Vector3(0.5, 0, 0), 0.5, limits);
    expect(withAnchor.distanceTo(reached)).toBe(0);
  });

  it('el tope se mide en el target nuevo', () => {
    const seen: Vector3[] = [];
    const camera = new Vector3(0, 0, 10);
    const target = new Vector3();
    zoomToward(camera, target, new Vector3(2, 0, 0), 0.5, {
      minDistanceAt: (at) => {
        seen.push(at.clone());
        return 0;
      },
      maxDistance: 60,
    });
    expect(seen[0]?.toArray()).toEqual([1, 0, 0]);
  });

  it('hacia fuera: el target vuelve al centro en proporción y llega a él en el máximo', () => {
    const camera = new Vector3(2, 0, 10);
    const target = new Vector3(2, 0, 0);
    // De 10 a 35: la mitad del camino hasta 60.
    zoomToward(camera, target, undefined, 3.5, limits);
    expect(target.toArray()).toEqual([1, 0, 0]);
    expect(camera.distanceTo(target)).toBeCloseTo(35);

    zoomToward(camera, target, undefined, 100, limits);
    expect(target.length()).toBe(0);
    expect(camera.length()).toBeCloseTo(60);
  });

  it('el máximo se mide desde el centro de la isla', () => {
    const camera = new Vector3(0, 0, 55);
    const target = new Vector3(0, 0, 0);
    zoomToward(camera, target, undefined, 2, limits);
    expect(camera.length()).toBeCloseTo(60);
  });
});
