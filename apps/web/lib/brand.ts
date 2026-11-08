/**
 * Colores de marca de la web anterior (fondo crema y carbón, links azul y
 * rosa, acento turquesa `glassTeal`), ajustados para contraste AA. El azul
 * original (#3d7aed) da 3,3:1 sobre el crema; este da más de 5:1.
 */
export const palette = {
  light: {
    bg: '#f0e7db',
    surface: '#f8f3ec',
    code: '#e6dccd',
    border: '#d8ccbc',
    fg: '#202023',
    muted: '#5c564f',
    link: '#2559c4',
    accent: '#1d6b68',
  },
  dark: {
    bg: '#202023',
    surface: '#2a2a2f',
    code: '#18181b',
    border: '#3a3a40',
    fg: '#f0e7db',
    muted: '#a9a39b',
    link: '#ff63c3',
    accent: '#88ccca',
  },
} as const;

/** Turquesa de la web anterior: fondo de botones y marcas, con texto oscuro. */
export const glassTeal = '#88ccca';

function channel(value: number): number {
  const c = value / 255;

  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);

  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Razón de contraste WCAG 2 entre dos colores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (hi + 0.05) / (lo + 0.05);
}
