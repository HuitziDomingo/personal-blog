'use client';

import { Box } from '@chakra-ui/react';
import { useEffect, useId, useRef } from 'react';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { createIslandControls, islandRange } from './island-controls';
import { REDUCED_MOTION_QUERY } from './island-loading';
import { createPointPicker, createSurfaceProbe } from './island-surface';

/** Modelo armado con scripts/build-island-model.mjs: fortaleza flotante (Quaternius, CC0). */
export const ISLAND_MODEL_URL = '/models/isla/isla.gltf';
/** Giro inicial: la isla empieza vista de 3/4, como la imagen fija. */
const START_ANGLE = Math.PI / 4;
const FOV = 30;
/** Ángulo de la cámara sobre el horizonte. */
const ELEVATION = (25 * Math.PI) / 180;
/** Aire alrededor de la isla dentro del hueco. */
const MARGIN = 1.08;

/** Textos de los controles, de los diccionarios de ADR-024. */
export interface IslandControlsText {
  label: string;
  instructions: string;
}

export interface IslandSceneProps {
  text: IslandControlsText;
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

export default function IslandScene({ text, visible, onReady, onError }: IslandSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  // El efecto se crea una vez: los textos le llegan por ref.
  const labels = useRef({ label: text.label, instructionsId });
  useEffect(() => {
    labels.current = { label: text.label, instructionsId };
  });
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
    // Un widget propio que recibe las flechas: `application` pide al lector de
    // pantalla que le pase las teclas (con `img` o `group` las usaría para leer).
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', labels.current.label);
    canvas.setAttribute('aria-describedby', labels.current.instructionsId);
    // Enfocable solo cuando hay isla que mover (al cargar el modelo).
    canvas.tabIndex = -1;
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
    // La isla, centrada en el origen y girada a 3/4. La cámara gira a su
    // alrededor (TrackballControls y el giro automático); la isla no se mueve.
    const pivot = new Group();
    pivot.rotation.y = START_ANGLE;
    scene.add(pivot);
    let model: Object3D | undefined;
    const controls = createIslandControls(camera, canvas, {
      reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY),
    });

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

    const frame = () => {
      // Entrada, giro automático, inercia y topes: los controles mueven la
      // cámara en cada cuadro, según el reloj (no según cuántos cuadros hubo).
      controls.update(performance.now());
      renderer.render(scene, camera);
    };

    // El bucle solo corre con la isla en pantalla y la pestaña visible.
    let onScreen = true;
    const updateLoop = () => {
      const running = model !== undefined && onScreen && !document.hidden && !disposed;
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
        // Vértices de la isla en el espacio de `pivot`.
        root.updateMatrixWorld(true);
        const points: Vector3[] = [];
        const box = new Box3();
        root.traverse((object) => {
          if (object instanceof Mesh) {
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
        // El raycast del tope de zoom usa las matrices del mundo desde el primer cuadro.
        pivot.updateMatrixWorld(true);
        model = root;

        const distance = fitDistance(points, camera.aspect);
        // La esfera que envuelve la isla es la del vértice más lejano del centro.
        const modelRadius = Math.sqrt(points.reduce((max, point) => Math.max(max, point.lengthSq()), 0));
        const range = islandRange(distance, modelRadius);
        camera.position.set(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(distance);
        camera.near = range.near;
        camera.far = range.far;
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        controls.frame({
          distance,
          modelRadius,
          surface: createSurfaceProbe(pivot, modelRadius),
          pick: createPointPicker(pivot, camera),
        });
        canvas.tabIndex = 0;

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
      controls.dispose();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', updateLoop);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (model) {
        disposeObject(model);
      }
      renderer.dispose();
      // Libera el contexto ya: el navegador limita cuántos puede haber abiertos.
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <Box
      position="absolute"
      inset="0"
      opacity={visible ? 1 : 0}
      transition="opacity 0.6s ease"
      // Invisible mientras carga: los clics llegan a la imagen, no a un canvas oculto.
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Box
        ref={containerRef}
        position="absolute"
        inset="0"
        css={{
          '& canvas': { outline: 'none', borderRadius: 'md' },
          '& canvas:focus-visible': { outline: '3px solid', outlineColor: 'brand.accent', outlineOffset: '2px' },
        }}
      />
      <p id={instructionsId} className="sr-only">
        {text.instructions}
      </p>
    </Box>
  );
}
