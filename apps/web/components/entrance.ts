import type { SystemStyleObject } from '@chakra-ui/react';

/** Paso entre tarjetas y tope: la última empieza a lo sumo 0,24 s después. */
const STAGGER_MS = 60;
const MAX_STEPS = 4;

/**
 * Animación de entrada de una tarjeta: aparece y sube 8 px. Solo CSS
 * (keyframes `entrada` del tema), sin JavaScript.
 *
 * - Solo con `prefers-reduced-motion: no-preference`: con `reduce` no hay
 *   animación y la tarjeta se ve desde el primer pintado.
 * - Sin layout shift: anima `opacity` y `transform`, que no mueven la caja en
 *   el layout ni cuentan para el CLS.
 * - `index` escalona las tarjetas de una lista; la primera no espera.
 */
export function entrance(index = 0): SystemStyleObject {
  return {
    '@media (prefers-reduced-motion: no-preference)': {
      animation: 'entrada 0.4s ease-out both',
      animationDelay: `${String(Math.min(index, MAX_STEPS) * STAGGER_MS)}ms`,
    },
  };
}
