import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

import { palette } from '@/lib/brand';
import { GLASS } from '@/lib/glass';

const { light, dark } = palette;

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

  return `rgb(${String(r)} ${String(g)} ${String(b)} / ${String(alpha)})`;
}

const glassFilter = `blur(${String(GLASS.blur)}px) saturate(${String(GLASS.saturate)})`;

/** Superficie sólida de siempre: sin backdrop-filter o con prefers-reduced-transparency. */
const solidSurface = {
  background: 'var(--chakra-colors-brand-surface)',
  borderColor: 'var(--chakra-colors-border)',
  boxShadow: 'none',
  backdropFilter: 'none',
};

const solidFallbacks = {
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': solidSurface,
  '@media (prefers-reduced-transparency: reduce)': solidSurface,
};

/**
 * Los tokens de Chakra traen `_light` y `_dark`; un `base` solo pierde frente
 * a su `_light`. `base` cubre además la página antes de que haya clase.
 */
function mode(lightValue: string, darkValue: string) {
  return { value: { base: lightValue, _light: lightValue, _dark: darkValue } };
}

const config = defineConfig({
  globalCss: {
    html: {
      scrollPaddingTop: '5rem',
      '@media (prefers-reduced-motion: no-preference)': { scrollBehavior: 'smooth' },
    },
    // Columna de al menos el alto visible: el <main> crece (flex: 1) y el footer
    // queda al fondo aunque la página sea corta (404, blog vacío, error).
    // Sin fondo propio: el color lo pone el `html` de Chakra (el lienzo) y así
    // la aurora (z-index -1) queda entre el lienzo y el contenido. Con fondo
    // en el body, lo taparía.
    body: {
      bg: 'transparent',
      color: 'fg',
      fontFamily: 'body',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
    },
    '::selection': { bg: 'brand.accent', color: 'bg' },
    // Blur-up (components/blur-image.tsx): el contenedor lleva la miniatura
    // borrosa y la imagen nítida aparece encima con un fundido de opacidad.
    // Sin movimiento con reduced-motion: ni se oculta ni se anima.
    '.blur-up': { display: 'block' },
    '.blur-up > img': {
      '@media (prefers-reduced-motion: no-preference)': { transition: 'opacity 0.35s ease-out' },
    },
    '.blur-up > img[data-blur-loading]': {
      '@media (prefers-reduced-motion: no-preference)': { opacity: 0 },
    },
    // Fondo aurora (components/aurora.tsx, lib/aurora.ts). Capa fija detrás de
    // todo (z-index -1, encima del fondo del html y debajo del body), recortada
    // a la pantalla: sin scroll horizontal ni efecto en el layout. Cada mancha
    // es un gradiente radial que ya nace borroso; se anima solo transform y
    // opacity. Quieta con prefers-reduced-motion.
    '.aurora': {
      position: 'fixed',
      inset: '0',
      zIndex: '-1',
      overflow: 'hidden',
      pointerEvents: 'none',
      contain: 'layout paint',
    },
    '.aurora > span': {
      position: 'absolute',
      borderRadius: '50%',
      background: 'radial-gradient(closest-side, rgb(var(--aurora-rgb) / var(--aurora-alpha-light)), transparent)',
      '@media (prefers-reduced-motion: no-preference)': {
        animationName: 'aurora-deriva',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDirection: 'alternate',
        willChange: 'transform, opacity',
      },
    },
    '.dark .aurora > span': {
      background: 'radial-gradient(closest-side, rgb(var(--aurora-rgb) / var(--aurora-alpha-dark)), transparent)',
    },
    // Vidrio selectivo (BLOG-149, lib/glass.ts): solo en lo que flota sobre la
    // aurora. Tinte semitransparente de la superficie de la marca, desenfoque
    // y saturación de lo que hay detrás, borde claro de 1 px y brillo arriba.
    // Los valores son los que mide el test de contraste de lib/glass.test.ts.
    '.glass': {
      background: rgba(GLASS.tint.light.color, GLASS.tint.light.alpha),
      borderColor: `rgb(255 255 255 / ${String(GLASS.edge.light.border)})`,
      boxShadow: `inset 0 1px 0 rgb(255 255 255 / ${String(GLASS.edge.light.highlight)}), 0 12px 32px -20px rgb(80 50 20 / 0.35)`,
      backdropFilter: glassFilter,
      ...solidFallbacks,
    },
    '.dark .glass': {
      background: rgba(GLASS.tint.dark.color, GLASS.tint.dark.alpha),
      borderColor: `rgb(255 255 255 / ${String(GLASS.edge.dark.border)})`,
      boxShadow: `inset 0 1px 0 rgb(255 255 255 / ${String(GLASS.edge.dark.highlight)}), 0 12px 32px -20px rgb(0 0 0 / 0.6)`,
      ...solidFallbacks,
    },
    '.sr-only': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      borderWidth: '0',
    },
  },
  theme: {
    // Entrada de las tarjetas (components/entrance.ts): opacidad y transform,
    // sin propiedades de layout.
    keyframes: {
      entrada: {
        from: { opacity: '0', transform: 'translateY(0.5rem)' },
        to: { opacity: '1', transform: 'none' },
      },
      // Fondo aurora: va y vuelve (alternate) entre la posición de reposo y el
      // desplazamiento de cada mancha. La opacidad máxima (1) es la del test
      // de contraste de lib/aurora.ts.
      'aurora-deriva': {
        '0%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.75' },
        '50%': { opacity: '1' },
        '100%': { transform: 'translate3d(var(--aurora-dx), var(--aurora-dy), 0) scale(var(--aurora-scale))', opacity: '0.85' },
      },
    },
    tokens: {
      fonts: {
        heading: { value: 'var(--font-heading), ui-rounded, system-ui, sans-serif' },
        body: { value: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
        mono: { value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: mode(light.bg, dark.bg),
          panel: mode(light.surface, dark.surface),
          subtle: mode(light.surface, dark.surface),
          muted: mode(light.code, dark.code),
        },
        fg: {
          DEFAULT: mode(light.fg, dark.fg),
          muted: mode(light.muted, dark.muted),
        },
        border: { DEFAULT: mode(light.border, dark.border) },
        brand: {
          link: mode(light.link, dark.link),
          accent: mode(light.accent, dark.accent),
          surface: mode(light.surface, dark.surface),
          code: mode(light.code, dark.code),
          header: mode('rgba(240, 231, 219, 0.82)', 'rgba(32, 32, 35, 0.82)'),
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
