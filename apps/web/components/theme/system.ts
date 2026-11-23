import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

import {
  AURORA_GLOW_MAX_VH,
  AURORA_GRAIN,
  AURORA_KEYFRAMES,
  AURORA_MOBILE_MAX_PX,
  blobGradient,
  glowAlphaFor,
  glowGradient,
  glowToneVars,
} from '@/lib/aurora';
import { accentButtonText, palette } from '@/lib/brand';
import { GLASS, HEADER_GLASS } from '@/lib/glass';

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
    // opacity, nunca filter. Quieta en su reposo con prefers-reduced-motion y
    // en la portada (la isla 3D ya usa la GPU; HomeView marca la página con
    // data-aurora-quieta). En móvil solo se pintan 3 manchas.
    '.aurora': {
      // Tonos y alfa del resplandor (BLOG-156); los lee .aurora::before.
      ...glowToneVars('light'),
      '--aurora-glow-alpha': String(glowAlphaFor('light', AURORA_MOBILE_MAX_PX)),
      '@media (max-width: 767.98px)': { '--aurora-glow-alpha': String(glowAlphaFor('light', 0)) },
      position: 'fixed',
      inset: '0',
      zIndex: '-1',
      overflow: 'hidden',
      pointerEvents: 'none',
      contain: 'layout paint',
    },
    // Por debajo de AURORA_MOBILE_MAX_PX (768) vale el alfa de móvil.
    // El degradado se escribe una vez; el tono y el alfa de cada modo y ancho
    // llegan por --aurora-t y --aurora-a (el CSS global viaja en cada HTML).
    '.aurora > span': {
      position: 'absolute',
      borderRadius: '50%',
      '--aurora-t': 'var(--aurora-tone-light)',
      '--aurora-a': 'var(--aurora-alpha-light)',
      background: blobGradient('--aurora-t', '--aurora-a'),
      '@media (max-width: 767.98px)': {
        '--aurora-a': 'var(--aurora-alpha-mobile-light)',
      },
      '@media (prefers-reduced-motion: no-preference)': {
        animationName: 'aurora-deriva',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDirection: 'alternate',
        willChange: 'transform, opacity',
      },
    },
    '.dark .aurora > span': {
      '--aurora-t': 'var(--aurora-tone-dark)',
      '--aurora-a': 'var(--aurora-alpha-dark)',
      '@media (max-width: 767.98px)': {
        '--aurora-a': 'var(--aurora-alpha-mobile-dark)',
      },
    },
    // Resplandor superior (BLOG-156): estático, debajo de las manchas, solo en
    // los primeros AURORA_GLOW_MAX_VH, con el alfa de --aurora-glow-alpha.
    '.aurora::before, .aurora::after': {
      content: '""',
      position: 'absolute',
      pointerEvents: 'none',
    },
    '.aurora::before': {
      top: '0',
      left: '0',
      right: '0',
      height: `${String(AURORA_GLOW_MAX_VH)}vh`,
      background: glowGradient(),
    },
    '.dark .aurora': {
      ...glowToneVars('dark'),
      '--aurora-glow-alpha': String(glowAlphaFor('dark', AURORA_MOBILE_MAX_PX)),
      '@media (max-width: 767.98px)': { '--aurora-glow-alpha': String(glowAlphaFor('dark', 0)) },
    },
    // Grano (BLOG-156): estático, encima de las manchas, casi invisible.
    '.aurora::after': {
      inset: '0',
      backgroundImage: `url(${AURORA_GRAIN.src})`,
      backgroundSize: `${String(AURORA_GRAIN.size)}px`,
      opacity: String(AURORA_GRAIN.opacity.light),
    },
    '.dark .aurora::after': {
      opacity: String(AURORA_GRAIN.opacity.dark),
    },
    '.aurora > span[data-desktop]': {
      '@media (max-width: 767.98px)': { display: 'none' },
    },
    'body:has([data-aurora-quieta]) .aurora > span': {
      animation: 'none',
      willChange: 'auto',
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
    // «Descargar CV» (components/cv-download-button.tsx, BLOG-152): el relleno
    // y el texto van como props del componente (le ganan al recipe de Link);
    // aquí, un brillo diagonal que cruza una vez al cargar (::before) y
    // otra en hover o foco (::after). Son dos capas para que al salir del
    // hover no se repita el brillo de la carga. Sin bucle y sin animación con
    // prefers-reduced-motion. Solo se anima transform.
    '.cv-cta': {
      position: 'relative',
      overflow: 'hidden',
      isolation: 'isolate',
      _focusVisible: { outline: '2px solid', outlineColor: 'fg', outlineOffset: '2px' },
      '&::before, &::after': {
        content: '""',
        position: 'absolute',
        insetY: '0',
        left: '0',
        width: '60%',
        pointerEvents: 'none',
        background: 'linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 0.45) 50%, transparent 80%)',
        transform: 'translateX(-120%)',
        zIndex: '-1',
      },
      '@media (prefers-reduced-motion: no-preference)': {
        '&::before': { animation: 'brillo 0.9s ease-out 0.6s 1 both' },
        '&:hover::after, &:focus-visible::after': { animation: 'brillo 0.9s ease-out 1' },
      },
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
      // Brillo del botón «Descargar CV»: cruza de izquierda a derecha una vez.
      brillo: {
        from: { transform: 'translateX(-120%)' },
        to: { transform: 'translateX(220%)' },
      },
      entrada: {
        from: { opacity: '0', transform: 'translateY(0.5rem)' },
        to: { opacity: '1', transform: 'none' },
      },
      // Fondo aurora: va y vuelve (alternate) entre la posición de reposo y el
      // desplazamiento de cada mancha. La opacidad máxima (1) es la del test
      // de contraste de lib/aurora.ts.
      'aurora-deriva': {
        '0%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: String(AURORA_KEYFRAMES.start) },
        '50%': { opacity: String(AURORA_KEYFRAMES.peak) },
        '100%': { transform: 'translate3d(var(--aurora-dx), var(--aurora-dy), 0) scale(var(--aurora-scale))', opacity: String(AURORA_KEYFRAMES.end) },
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
          // Texto sobre el acento: el del botón «Descargar CV» (BLOG-152).
          onAccent: mode(accentButtonText.light, accentButtonText.dark),
          header: mode(rgba(HEADER_GLASS.tint.light.color, HEADER_GLASS.tint.light.alpha), rgba(HEADER_GLASS.tint.dark.color, HEADER_GLASS.tint.dark.alpha)),
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
