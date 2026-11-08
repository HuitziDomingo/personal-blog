import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

import { palette } from '@/lib/brand';

const { light, dark } = palette;

function mode(lightValue: string, darkValue: string) {
  return { value: { base: lightValue, _dark: darkValue } };
}

const config = defineConfig({
  globalCss: {
    html: { scrollPaddingTop: '5rem' },
    body: { bg: 'bg', color: 'fg', fontFamily: 'body', WebkitFontSmoothing: 'antialiased' },
    '::selection': { bg: 'brand.accent', color: 'bg' },
    '@media (prefers-reduced-motion: no-preference)': {
      html: { scrollBehavior: 'smooth' },
    },
  },
  theme: {
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
