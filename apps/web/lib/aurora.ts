/**
 * Fondo «aurora» de la web (BLOG-142; v2 viva en BLOG-150): cinco manchas de
 * color abajo y a los costados que se desplazan, se cruzan y cambian de tono
 * despacio. Los datos viven aquí, sin React ni CSS, para que el test de
 * contraste mida exactamente lo que se pinta.
 *
 * - Cada mancha es un `radial-gradient(closest-side, color, transparent)`: ya
 *   nace borrosa, sin `filter`. Su opacidad cae en línea recta del centro
 *   (`alpha`) al borde (0).
 * - Cada mancha tiene dos capas del mismo tamaño con dos tonos (`tones`): la
 *   de abajo se desvanece mientras aparece la de arriba, en un ciclo propio
 *   (`toneDuration`). El cambio de tono es solo `opacity`.
 * - La mancha entera va y vuelve entre su reposo y su desplazamiento
 *   (`drift`, `rise`, `scale`), con la opacidad de `AURORA_KEYFRAMES`.
 * - Con prefers-reduced-motion se queda quieta en su reposo, con opacidad 1
 *   y solo el primer tono: visible, sin movimiento.
 * - `alpha` es por modo y por ancho: en móvil (< `AURORA_MOBILE_MAX_PX`) puede
 *   ser otra.
 */

export type AuroraMode = 'light' | 'dark';

export interface AuroraTone {
  name: 'ambar' | 'coral' | 'magenta' | 'violeta';
  /** `#rrggbb` por modo: claros y saturados en claro, hondos y saturados en oscuro. */
  light: string;
  dark: string;
}

export interface AuroraBlob {
  name: string;
  /** Tono de la capa de abajo y de la de arriba; la de arriba aparece y se va. */
  tones: readonly [AuroraTone, AuroraTone];
  /** Opacidad del centro, por modo, en escritorio y en móvil. */
  alpha: { light: number; dark: number; mobileLight: number; mobileDark: number };
  /** Diámetro, en vw, con tope en vh (pantallas muy anchas). */
  size: number;
  maxSizeVh: number;
  /** Centro en reposo: x en vw desde la izquierda, y en vh desde arriba. */
  x: number;
  y: number;
  /** Desplazamiento máximo, en vw (x) y en vh (y). */
  drift: number;
  rise: number;
  /** Escala máxima. */
  scale: number;
  /** Duración de un ciclo de ida del desplazamiento, en segundos (va y vuelve). */
  duration: number;
  /** Duración de un ciclo de ida del cambio de tono, en segundos. */
  toneDuration: number;
}

export const TONES = {
  ambar: { name: 'ambar', light: '#ffd25a', dark: '#7a3d00' },
  coral: { name: 'coral', light: '#ffc4a3', dark: '#82200f' },
  magenta: { name: 'magenta', light: '#ffbfdf', dark: '#7d0c4a' },
  violeta: { name: 'violeta', light: '#d7c7ff', dark: '#3f1a99' },
} as const satisfies Record<string, AuroraTone>;

const { ambar, coral, magenta, violeta } = TONES;

export const AURORA_BLOBS: readonly AuroraBlob[] = [
  { name: 'abajo-izquierda', tones: [ambar, coral], alpha: { light: 0.27, dark: 0.45, mobileLight: 0.36, mobileDark: 0.45 }, size: 70, maxSizeVh: 110, x: -2, y: 88, drift: 14, rise: -8, scale: 1.1, duration: 23, toneDuration: 19 },
  { name: 'izquierda', tones: [coral, magenta], alpha: { light: 0.25, dark: 0.45, mobileLight: 0.36, mobileDark: 0.45 }, size: 52, maxSizeVh: 84, x: 2, y: 48, drift: 12, rise: 10, scale: 1.08, duration: 29, toneDuration: 26 },
  { name: 'abajo-derecha', tones: [magenta, violeta], alpha: { light: 0.26, dark: 0.45, mobileLight: 0.34, mobileDark: 0.45 }, size: 66, maxSizeVh: 106, x: 102, y: 92, drift: -15, rise: -6, scale: 1.1, duration: 19, toneDuration: 23 },
  { name: 'derecha', tones: [ambar, magenta], alpha: { light: 0.23, dark: 0.45, mobileLight: 0.31, mobileDark: 0.45 }, size: 50, maxSizeVh: 80, x: 98, y: 50, drift: -12, rise: 8, scale: 1.08, duration: 27, toneDuration: 17 },
  { name: 'abajo-centro', tones: [violeta, coral], alpha: { light: 0.36, dark: 0.45, mobileLight: 0.44, mobileDark: 0.45 }, size: 62, maxSizeVh: 92, x: 46, y: 112, drift: 10, rise: -10, scale: 1.1, duration: 16, toneDuration: 29 },
];

/** Por debajo de este ancho (el `md` de Chakra, 48em) vale el alfa de móvil. */
export const AURORA_MOBILE_MAX_PX = 768;

/**
 * Opacidad de la mancha entera a lo largo de un ciclo de ida (keyframes
 * `aurora-deriva` del tema): el desplazamiento va de 0 a 1 en todo el ciclo y
 * la opacidad pasa por estos tres puntos (0 %, 50 % y 100 %).
 */
export const AURORA_KEYFRAMES = { start: 0.75, peak: 1, end: 0.85 } as const;

/** `ease-in-out` de CSS: `cubic-bezier(0.42, 0, 0.58, 1)`. */
export function easeInOut(x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    const bx = 3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t ** 2 * 0.58 + t ** 3;
    if (bx < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;

  return 3 * (1 - t) * t ** 2 + t ** 3;
}

/**
 * Estado de la mancha en la fracción `p` (0–1) de su ciclo de ida. El
 * transform solo tiene keyframes en 0 % y 100 %: la curva se aplica a todo el
 * ciclo. La opacidad tiene uno más en 50 %: la curva se aplica en cada mitad.
 */
export function blobState(p: number): { progress: number; opacity: number } {
  const { start, peak, end } = AURORA_KEYFRAMES;
  const opacity = p < 0.5 ? start + (peak - start) * easeInOut(p / 0.5) : peak + (end - peak) * easeInOut((p - 0.5) / 0.5);

  return { progress: easeInOut(p), opacity };
}

export function alphaFor(blob: AuroraBlob, mode: AuroraMode, viewportWidth: number): number {
  const mobile = viewportWidth < AURORA_MOBILE_MAX_PX;
  if (mode === 'light') return mobile ? blob.alpha.mobileLight : blob.alpha.light;

  return mobile ? blob.alpha.mobileDark : blob.alpha.dark;
}

const PHASE_SAMPLES = 64;

/**
 * La mayor fracción de su `alpha` con que la mancha puede llegar al punto
 * (px, py) de una pantalla de w × h px: el máximo, en todo su ciclo, de su
 * opacidad por la caída lineal del gradiente. Incluye el reposo quieto de
 * reduced-motion (opacidad 1 sin desplazamiento).
 */
export function maxCoverage(blob: AuroraBlob, px: number, py: number, w: number, h: number): number {
  const vw = w / 100;
  const vh = h / 100;
  const radius = Math.min(blob.size * vw, blob.maxSizeVh * vh) / 2;
  const cover = (progress: number, opacity: number) => {
    const cx = blob.x * vw + blob.drift * vw * progress;
    const cy = blob.y * vh + blob.rise * vh * progress;
    const r = radius * (1 + (blob.scale - 1) * progress);

    return opacity * Math.max(0, 1 - Math.hypot(px - cx, py - cy) / r);
  };

  let max = cover(0, 1);
  for (let i = 0; i <= PHASE_SAMPLES; i++) {
    const { progress, opacity } = blobState(i / PHASE_SAMPLES);
    max = Math.max(max, cover(progress, opacity));
  }

  return max;
}

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);

  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Rango posible de cada canal (0–1) del color de un punto. */
export interface ColorBox {
  lo: Rgb;
  hi: Rgb;
}

const FRACTION_SAMPLES = 6;
const TONE_SAMPLES = 10;

/**
 * Los colores que puede tener el punto (px, py): el lienzo con cada mancha
 * encima, en el orden del DOM, con cualquier opacidad entre 0 y su máximo en
 * ese punto y en cualquier momento del cambio de tono (las dos capas en
 * fundido cruzado). Las duraciones no tienen un múltiplo común cercano, así
 * que cualquier combinación de fases llega a darse.
 *
 * La composición «over» en sRGB (como la hace el navegador) es creciente en
 * el color de abajo, así que basta seguir el mínimo y el máximo de cada canal.
 * Medir en el extremo de cada canal es del lado seguro: no todas las esquinas
 * de la caja se dan a la vez.
 */
export function colorBox(bg: string, mode: AuroraMode, px: number, py: number, w: number, h: number): ColorBox {
  const base = parseHex(bg);
  let lo = [...base];
  let hi = [...base];

  for (const blob of AURORA_BLOBS) {
    const kMax = maxCoverage(blob, px, py, w, h);
    if (kMax === 0) continue;
    const alpha = alphaFor(blob, mode, w);
    const below = parseHex(blob.tones[0][mode]);
    const above = parseHex(blob.tones[1][mode]);
    const nextLo = [...lo];
    const nextHi = [...hi];
    for (let i = 0; i <= FRACTION_SAMPLES; i++) {
      const k = (kMax * i) / FRACTION_SAMPLES;
      for (let j = 0; j <= TONE_SAMPLES; j++) {
        const s = j / TONE_SAMPLES;
        const a1 = k * alpha * (1 - s);
        const a2 = k * alpha * s;
        for (let c = 0; c < 3; c++) {
          const over = (v: number) => (v * (1 - a1) + below[c as 0] * a1) * (1 - a2) + above[c as 0] * a2;
          nextLo[c] = Math.min(nextLo[c] ?? 1, over(lo[c] ?? 1));
          nextHi[c] = Math.max(nextHi[c] ?? 0, over(hi[c] ?? 0));
        }
      }
    }
    lo = nextLo;
    hi = nextHi;
  }

  return { lo: lo as unknown as Rgb, hi: hi as unknown as Rgb };
}

/** Pantallas en que se mide: móviles, tableta y escritorio hasta 2560 px. */
export const AURORA_VIEWPORTS: readonly (readonly [number, number])[] = [
  [360, 740],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];

/** Puntos por lado de la rejilla con que se mide cada pantalla. */
export const AURORA_GRID = 24;

/** Los puntos de la rejilla de una pantalla, bordes incluidos. */
export function gridPoints(w: number, h: number, n = AURORA_GRID): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) points.push([(w * i) / n, (h * j) / n]);

  return points;
}
