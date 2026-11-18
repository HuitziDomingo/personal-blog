'use client';

import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import poster from '@/assets/img/isla.webp';

import { browserLoadingEnv, islandMode, REDUCED_MOTION_QUERY, supportsWebGL, whenIdleAndVisible } from './island-loading';

// three.js va solo en este chunk: se pide cuando el componente se monta, no
// en el JS inicial de la portada, y nunca en el servidor.
const IslandScene = dynamic(() => import('./island-scene'), { ssr: false });

/**
 * `waiting`: la imagen, hasta que el navegador quede libre y la isla esté en
 * pantalla. `loading`: la escena se monta, todavía invisible. `ready`: la
 * escena sustituye a la imagen. `static`: la imagen, para siempre
 * (reduced-motion, sin WebGL o si la escena falla).
 */
export type IslandPhase = 'waiting' | 'loading' | 'ready' | 'static';

/** Proporción del hueco: la de la imagen fija, para que nada se mueva (CLS 0). */
const ASPECT_RATIO = `${String(poster.width)} / ${String(poster.height)}`;

export function IslandHero({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<IslandPhase>('waiting');

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    if (islandMode({ reducedMotion: reducedMotion.matches, webgl: supportsWebGL(document) }) === 'static') {
      setPhase('static');
      return;
    }

    // Si el sistema activa reduced-motion con la isla ya cargada, se desmonta
    // la escena (que libera sus recursos) y vuelve la imagen.
    const onMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setPhase('static');
      }
    };
    reducedMotion.addEventListener('change', onMotionChange);
    const cancel = whenIdleAndVisible(
      element,
      () => {
        setPhase((current) => (current === 'waiting' ? 'loading' : current));
      },
      browserLoadingEnv(window),
    );

    return () => {
      cancel();
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, []);

  const showScene = phase === 'loading' || phase === 'ready';

  return (
    <Box
      ref={ref}
      position="relative"
      w="full"
      maxW="480px"
      mx="auto"
      aspectRatio={ASPECT_RATIO}
      data-island-phase={phase}
    >
      <Image
        src={poster}
        alt={alt}
        sizes="(min-width: 520px) 480px, calc(100vw - 2rem)"
        // Es el elemento del LCP: se precarga (`priority` está deprecada en
        // Next 16) y se pide con prioridad alta.
        preload
        fetchPriority="high"
        style={{
          width: '100%',
          height: 'auto',
          transition: 'opacity 0.6s ease',
          opacity: phase === 'ready' ? 0 : 1,
        }}
      />
      {showScene && (
        <IslandScene
          visible={phase === 'ready'}
          onReady={() => {
            setPhase((current) => (current === 'loading' ? 'ready' : current));
          }}
          onError={() => {
            setPhase('static');
          }}
        />
      )}
    </Box>
  );
}
