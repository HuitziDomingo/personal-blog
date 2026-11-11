import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

import { palette } from '@/lib/brand';

const { light, dark } = palette;

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
    body: {
      bg: 'bg',
      color: 'fg',
      fontFamily: 'body',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
    },
    '::selection': { bg: 'brand.accent', color: 'bg' },
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
