'use client';

import { Box, Spinner } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import Image, { getImageProps } from 'next/image';
import { useEffect, useRef, useState } from 'react';

import poster from '@/assets/img/isla.webp';

import type { IslandControlsText } from './island-scene';
import { browserLoadingEnv, islandMode, REDUCED_MOTION_QUERY, supportsWebGL, whenIdleAndVisible } from './island-loading';

// three.js va solo en este chunk: se pide cuando el componente se monta, no
// en el JS inicial de la portada, y nunca en el servidor.
const IslandScene = dynamic(() => import('./island-scene'), { ssr: false });

/**
 * `waiting`: el spinner, hasta que el navegador quede libre y la isla esté en
 * pantalla. `loading`: el spinner, mientras la escena carga, todavía invisible.
 * `ready`: la escena, sin spinner. `static`: la imagen fija, para siempre
 * (reduced-motion, sin WebGL o si la escena falla).
 */
export type IslandPhase = 'waiting' | 'loading' | 'ready' | 'static';

/** Proporción del hueco: la de la imagen fija, para que nada se mueva (CLS 0). */
const ASPECT_RATIO = `${String(poster.width)} / ${String(poster.height)}`;
/** 720 px desde 768 px de ventana (la columna de la portada); antes, el ancho de la ventana menos el margen. */
const SIZES = '(min-width: 768px) 720px, calc(100vw - 2rem)';
/** GIF transparente de 1 px: lo que pide `<picture>` cuando no hay reduced-motion (no descarga nada). */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** Visualmente oculto, pero en el árbol de accesibilidad (como `sr-only`). */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
} as const;

/**
 * La imagen fija mientras no se sabe si habrá escena (el HTML del servidor no
 * sabe si hay reduced-motion). Con reduced-motion se ve desde el primer
 * pintado; sin él, `<picture>` elige un GIF vacío (la imagen ni se descarga) y
 * queda oculta a la vista, pero su alt sigue describiendo la isla.
 */
function MotionAwarePoster({ alt }: { alt: string }) {
  const { props } = getImageProps({ src: poster, alt, sizes: SIZES, fetchPriority: 'high' });
  return (
    <Box asChild _motionSafe={VISUALLY_HIDDEN}>
      <picture>
        <source media="(prefers-reduced-motion: no-preference)" srcSet={BLANK} />
        <img {...props} alt={alt} style={{ width: '100%', height: 'auto' }} />
      </picture>
    </Box>
  );
}

export interface IslandHeroText extends IslandControlsText {
  /** Texto del spinner para lectores de pantalla. */
  loading: string;
}

export function IslandHero({ alt, controls }: { alt: string; controls: IslandHeroText }) {
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
      maxW="720px"
      mx="auto"
      aspectRatio={ASPECT_RATIO}
      data-island-phase={phase}
    >
      {phase === 'static' ? (
        <Image src={poster} alt={alt} sizes={SIZES} fetchPriority="high" style={{ width: '100%', height: 'auto' }} />
      ) : (
        <MotionAwarePoster alt={alt} />
      )}
      {(phase === 'waiting' || phase === 'loading') && (
        // Como el spinner del perro: centrado en el hueco mientras carga el
        // modelo. Con reduced-motion no se ve ni gira (ahí manda la imagen).
        <Box
          role="status"
          position="absolute"
          inset="0"
          display="flex"
          alignItems="center"
          justifyContent="center"
          _motionReduce={{ display: 'none' }}
          data-island-spinner=""
        >
          <Spinner
            size="xl"
            borderWidth="3px"
            color="brand.accent"
            css={{ '--spinner-track-color': 'colors.border' }}
            _motionReduce={{ animation: 'none' }}
          />
          <span className="sr-only">{controls.loading}</span>
        </Box>
      )}
      {phase !== 'static' && (
        // Sin JavaScript no hay escena: la imagen fija, encima del spinner.
        <noscript>
          <style>{'[data-island-spinner]{display:none}'}</style>
          <img
            src={poster.src}
            alt={alt}
            width={poster.width}
            height={poster.height}
            style={{ position: 'absolute', inset: 0, width: '100%', height: 'auto' }}
          />
        </noscript>
      )}
      {showScene && (
        <IslandScene
          text={controls}
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
