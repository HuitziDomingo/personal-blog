import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { createSurfaceProbe } from './island-surface';

/** Un cubo de lado `size` con centro en (x, y, z). */
function box(size: number, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return mesh;
}

function scene(...meshes: Mesh[]): Group {
  const root = new Group();
  root.add(...meshes);
  root.updateMatrixWorld(true);
  return root;
}

const Z = new Vector3(0, 0, 1);

describe('createSurfaceProbe', () => {
  it('mide la distancia del target a la cara del modelo en esa dirección', () => {
    const probe = createSurfaceProbe(scene(box(2)), 5);
    expect(probe(new Vector3(), Z)).toBeCloseTo(1);
    expect(probe(new Vector3(), new Vector3(1, 1, 0).normalize())).toBeCloseTo(Math.SQRT2);
  });

  it('con el target dentro, se queda con la superficie más exterior: la cámara no queda atrapada entre muros', () => {
    // Un muro interior a 1 del target y otro exterior a 4, en la misma dirección.
    const probe = createSurfaceProbe(scene(box(2), box(2, 0, 0, 3)), 6);
    expect(probe(new Vector3(), Z)).toBeCloseTo(4);
  });

  it('no cuenta lo que hay detrás del target', () => {
    const probe = createSurfaceProbe(scene(box(2, 0, 0, -3)), 6);
    expect(probe(new Vector3(), Z)).toBe(0);
  });

  it('sin modelo en esa dirección devuelve 0', () => {
    const probe = createSurfaceProbe(scene(box(2)), 5);
    expect(probe(new Vector3(0, 3, 0), Z)).toBe(0);
  });

  it('con el target movido, la esfera de partida lo sigue', () => {
    const probe = createSurfaceProbe(scene(box(2)), 1.8);
    // Target a 0.5 por encima del centro, mirando en horizontal: la cara está a 1.
    expect(probe(new Vector3(0, 0.5, 0), Z)).toBeCloseTo(1);
  });

  it('usa las matrices del mundo (la isla está girada dentro de su pivote)', () => {
    const root = new Group();
    const wide = new Mesh(new BoxGeometry(4, 1, 1), new MeshBasicMaterial());
    root.add(wide);
    root.rotation.y = Math.PI / 2;
    root.updateMatrixWorld(true);
    const probe = createSurfaceProbe(root, 5);
    // Girado 90°, el lado largo (2 desde el centro) apunta a Z.
    expect(probe(new Vector3(), Z)).toBeCloseTo(2);
  });
});
