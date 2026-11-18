'use client';

import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  AnimationMixer,
  Box3,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  type Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Modelo armado con scripts/build-island-model.mjs (Quaternius, CC0). */
export const ISLAND_MODEL_URL = '/models/isla/isla.gltf';
/** La única animación que se reproduce, en bucle. */
export const ISLAND_CLIP = 'CharacterArmature|Idle';
/** Una vuelta completa de la isla, en segundos. */
const TURN_SECONDS = 90;
/** Giro inicial: la isla empieza vista de 3/4, como la imagen fija. */
const START_ANGLE = Math.PI / 4;
/** Flotación: amplitud (fracción del radio) y periodo en segundos. */
const FLOAT_AMPLITUDE = 0.03;
const FLOAT_SECONDS = 6;
const FOV = 30;
/** Ángulo de la cámara sobre el horizonte. */
const ELEVATION = (25 * Math.PI) / 180;
/** Aire alrededor de la isla (y de su flotación) dentro del hueco. */
const MARGIN = 1.08;

export interface IslandSceneProps {
  /** Si la escena ya sustituyó a la imagen fija. */
  visible: boolean;
  /** Cuando el modelo cargó y ya hay un primer cuadro dibujado. */
  onReady: () => void;
  /** Si el modelo no carga o se pierde el contexto WebGL. */
  onError: () => void;
}

/**
 * Distancia mínima de la cámara para que la isla quepa en el hueco en
 * cualquier punto de su giro. Para cada vértice, girado cada 15°, con `depth`
 * su avance hacia la cámara: cabe si |y| ≤ tan(fov/2)·(d − depth), es decir,
 * d ≥ |y| / tan(fov/2) + depth (y lo mismo en horizontal con el aspecto).
 */
function fitDistance(points: readonly Vector3[], aspect: number): number {
  const tanVertical = Math.tan((FOV * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;
  const sinElevation = Math.sin(ELEVATION);
  const cosElevation = Math.cos(ELEVATION);
  let distance = 0;
  for (let step = 0; step < 24; step++) {
    const angle = (step / 24) * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    for (const point of points) {
      const x = point.x * cos + point.z * sin;
      const z = -point.x * sin + point.z * cos;
      // Base de la cámara: hacia ella (0, sin, cos) y hacia arriba (0, cos, −sin).
      const depth = point.y * sinElevation + z * cosElevation;
      const up = point.y * cosElevation - z * sinElevation;
      distance = Math.max(distance, Math.abs(up) / tanVertical + depth, Math.abs(x) / tanHorizontal + depth);
    }
  }
  return distance * MARGIN;
}

/** Libera geometrías, materiales y texturas de un objeto y sus hijos. */
function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    (object.geometry as { dispose: () => void }).dispose();
    const materials = (Array.isArray(object.material) ? object.material : [object.material]) as Material[];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && (value as Partial<Texture>).isTexture === true) {
          (value as Texture).dispose();
        }
      }
      material.dispose();
    }
  });
}

export default function IslandScene({ visible, onReady, onError }: IslandSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Los callbacks cambian en cada render del padre; la escena se crea una vez.
  const callbacks = useRef({ onReady, onError });
  useEffect(() => {
    callbacks.current = { onReady, onError };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 10, 7);
    scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, -6, -3);
    scene.add(fill);

    const camera = new PerspectiveCamera(FOV, 4 / 3, 0.1, 1000);
    // La isla gira y flota dentro de `pivot`, centrada en el origen.
    const pivot = new Group();
    scene.add(pivot);
    let mixer: AnimationMixer | undefined;
    let model: Object3D | undefined;
    let radius = 1;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();

    let last = performance.now();
    let elapsed = 0;
    const frame = () => {
      const now = performance.now();
      // Tope de 0.1 s por cuadro: tras una pausa larga, la animación no salta.
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsed += delta;
      mixer?.update(delta);
      pivot.rotation.y = START_ANGLE + (elapsed / TURN_SECONDS) * Math.PI * 2;
      pivot.position.y = Math.sin((elapsed / FLOAT_SECONDS) * Math.PI * 2) * radius * FLOAT_AMPLITUDE;
      renderer.render(scene, camera);
    };

    // El bucle solo corre con la isla en pantalla y la pestaña visible.
    let onScreen = true;
    const updateLoop = () => {
      const running = model !== undefined && onScreen && !document.hidden && !disposed;
      if (running) {
        last = performance.now();
      }
      renderer.setAnimationLoop(running ? frame : null);
    };
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      updateLoop();
    });
    observer.observe(container);
    document.addEventListener('visibilitychange', updateLoop);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onError();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    new GLTFLoader().load(
      ISLAND_MODEL_URL,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const root = gltf.scene;
        // Vértices de la isla en el espacio de `pivot`, sin las mallas con
        // esqueleto: three las dibuja con los huesos, pero su transformación de
        // nodo las haría parecer en otro sitio. El Rey Hongo está sobre la isla.
        root.updateMatrixWorld(true);
        const points: Vector3[] = [];
        const box = new Box3();
        root.traverse((object) => {
          if (object instanceof Mesh && !(object instanceof SkinnedMesh)) {
            const position = (object as Mesh).geometry.getAttribute('position');
            for (let index = 0; index < position.count; index++) {
              const point = new Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
              points.push(point);
              box.expandByPoint(point);
            }
          }
        });
        // Eje de giro: en el plano, el promedio de los vértices (el centro de la
        // isla, aunque una nube alargue la caja hacia un lado); en altura, el
        // centro de la caja.
        const center = points
          .reduce((sum, point) => sum.add(point), new Vector3())
          .divideScalar(Math.max(points.length, 1))
          .setY(box.getCenter(new Vector3()).y);
        root.position.sub(center);
        for (const point of points) {
          point.sub(center);
        }
        pivot.add(root);
        model = root;
        radius = box.getSize(new Vector3()).y / 2;

        const distance = fitDistance(points, camera.aspect);
        camera.position.set(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(distance);
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        const clip = gltf.animations.find((animation) => animation.name === ISLAND_CLIP);
        if (clip) {
          mixer = new AnimationMixer(root);
          mixer.clipAction(clip).play();
        }

        frame();
        updateLoop();
        callbacks.current.onReady();
      },
      undefined,
      () => {
        if (!disposed) {
          callbacks.current.onError();
        }
      },
    );

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', updateLoop);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      mixer?.stopAllAction();
      if (model) {
        mixer?.uncacheRoot(model);
        disposeObject(model);
      }
      renderer.dispose();
      // Libera el contexto ya: el navegador limita cuántos puede haber abiertos.
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }}
    />
  );
}
