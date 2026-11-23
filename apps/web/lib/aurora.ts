/**
 * Fondo «aurora» de la web (BLOG-142; v2 viva en BLOG-150, ajustada en
 * BLOG-151): cinco manchas de color abajo y a los costados (tres en móvil)
 * que se desplazan y se cruzan despacio. Los datos viven aquí, sin React ni CSS, para que el test de
 * contraste mida exactamente lo que se pinta.
 *
 * - Cada mancha es un `radial-gradient(closest-side, …)`: ya nace borrosa,
 *   sin `filter`. Su opacidad cae del centro (`alpha`) al borde (0) con la
 *   curva `falloff`, en `FALLOFF` paradas (BLOG-156).
 * - Arriba, un resplandor ESTÁTICO (`AURORA_GLOW_OVALS`, BLOG-156): óvalos
 *   de tonos algo más saturados que se apagan antes de `AURORA_GLOW_MAX_VH`,
 *   con el alfa de `AURORA_GLOW_ALPHA`.
 * - Encima de todo, un grano estático muy tenue (`AURORA_GRAIN`) que rompe
 *   las bandas de los degradados.
 * - Cada mancha tiene un solo tono (`tone`): sin cambio de tono, que
 *   costaba una capa compuesta más por mancha (BLOG-151).
 * - En móvil (< `AURORA_MOBILE_MAX_PX`) solo se pintan las manchas con
 *   `mobile: true`.
 * - La mancha entera va y vuelve entre su reposo y su desplazamiento
 *   (`drift`, `rise`, `scale`), con la opacidad de `AURORA_KEYFRAMES`.
 * - Con prefers-reduced-motion, y siempre en la portada (la isla 3D ya
 *   consume GPU), se queda quieta en su reposo con opacidad 1: visible, sin
 *   movimiento.
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
  tone: AuroraTone;
  /** Si se pinta en móvil (< `AURORA_MOBILE_MAX_PX`). */
  mobile: boolean;
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
}

/**
 * Caída de la opacidad de una mancha o de un óvalo del resplandor, del
 * centro (t = 0) al borde (t = 1): el núcleo triweight (1 − t²)³, parecido a
 * una gaussiana, con pendiente cero en el centro y en el borde: no deja
 * bordes ni anillos (BLOG-156).
 */
export function falloff(t: number): number {
  if (t >= 1) return 0;
  const u = 1 - t * t;

  return u * u * u;
}

/** Paradas del degradado `[posición 0–1, fracción del alfa]`, redondeadas como se escriben en CSS. */
export const FALLOFF: readonly (readonly [number, number])[] = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;

  return [t, Math.round(falloff(t) * 1000) / 1000] as const;
});

/** Lo que pinta el navegador con `FALLOFF`: interpolación lineal entre paradas. */
export function falloffCss(t: number): number {
  if (t >= 1) return 0;
  const segments = FALLOFF.length - 1;
  const i = Math.floor(t * segments);
  const f = t * segments - i;
  const a = FALLOFF[i]?.[1] ?? 0;
  const b = FALLOFF[i + 1]?.[1] ?? 0;

  return a * (1 - f) + b * f;
}

export const TONES = {
  ambar: { name: 'ambar', light: '#ffd25a', dark: '#7a3d00' },
  coral: { name: 'coral', light: '#ffc4a3', dark: '#82200f' },
  magenta: { name: 'magenta', light: '#ffbfdf', dark: '#7d0c4a' },
  violeta: { name: 'violeta', light: '#d7c7ff', dark: '#3f1a99' },
} as const satisfies Record<string, AuroraTone>;

const { ambar, coral, magenta, violeta } = TONES;

export const AURORA_BLOBS: readonly AuroraBlob[] = [
  { name: 'abajo-izquierda', tone: ambar, mobile: true, alpha: { light: 0.5, dark: 0.45, mobileLight: 0.5, mobileDark: 0.45 }, size: 70, maxSizeVh: 110, x: -2, y: 88, drift: 14, rise: -8, scale: 1.1, duration: 23 },
  { name: 'izquierda', tone: coral, mobile: false, alpha: { light: 0.5, dark: 0.45, mobileLight: 0.5, mobileDark: 0.45 }, size: 52, maxSizeVh: 84, x: 2, y: 48, drift: 12, rise: 10, scale: 1.08, duration: 29 },
  { name: 'abajo-derecha', tone: magenta, mobile: true, alpha: { light: 0.5, dark: 0.45, mobileLight: 0.5, mobileDark: 0.45 }, size: 66, maxSizeVh: 106, x: 102, y: 92, drift: -15, rise: -6, scale: 1.1, duration: 19 },
  { name: 'derecha', tone: ambar, mobile: false, alpha: { light: 0.5, dark: 0.45, mobileLight: 0.5, mobileDark: 0.45 }, size: 50, maxSizeVh: 80, x: 98, y: 50, drift: -12, rise: 8, scale: 1.08, duration: 27 },
  { name: 'abajo-centro', tone: violeta, mobile: true, alpha: { light: 0.5, dark: 0.45, mobileLight: 0.5, mobileDark: 0.45 }, size: 62, maxSizeVh: 92, x: 46, y: 112, drift: 10, rise: -10, scale: 1.1, duration: 16 },
];

/** Óvalo del resplandor superior: centro en vw/vh y radios en vw/vh. */
export interface GlowOval {
  name: string;
  tone: AuroraTone;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Tonos del resplandor: los de las manchas, algo más saturados (BLOG-156). */
export const GLOW_TONES = {
  ambar: { name: 'ambar', light: '#ffc640', dark: '#8f4600' },
  magenta: { name: 'magenta', light: '#ffa8d4', dark: '#940a57' },
  violeta: { name: 'violeta', light: '#c6b0ff', dark: '#4a1cc4' },
} as const satisfies Record<string, AuroraTone>;

/** El resplandor no llega por debajo de este alto, en vh. */
export const AURORA_GLOW_MAX_VH = 45;

/** De abajo arriba en el orden de pintado. */
export const AURORA_GLOW_OVALS: readonly GlowOval[] = [
  { name: 'centro', tone: GLOW_TONES.ambar, x: 50, y: -6, rx: 42, ry: 44 },
  { name: 'izquierda', tone: GLOW_TONES.magenta, x: 14, y: -4, rx: 40, ry: 42 },
  { name: 'derecha', tone: GLOW_TONES.violeta, x: 86, y: -4, rx: 40, ry: 42 },
];

export interface GlowAlpha {
  light: number;
  dark: number;
  mobileLight: number;
  mobileDark: number;
}

/**
 * Alfa del centro de cada óvalo del resplandor: la variante B, la media de
 * las tres que se compararon (BLOG-156). El máximo que pasa el test de
 * contraste es 0,60 en claro (link sobre el óvalo violeta) y 0,45 en oscuro
 * (texto atenuado sobre el centro).
 */
export const AURORA_GLOW_ALPHA: GlowAlpha = { light: 0.42, dark: 0.32, mobileLight: 0.42, mobileDark: 0.32 };

export function glowAlphaFor(mode: AuroraMode, viewportWidth: number): number {
  const alpha = AURORA_GLOW_ALPHA;
  const mobile = viewportWidth < AURORA_MOBILE_MAX_PX;
  if (mode === 'light') return mobile ? alpha.mobileLight : alpha.light;

  return mobile ? alpha.mobileDark : alpha.dark;
}

/** Fracción del alfa del óvalo en el punto (px, py) de una pantalla de w × h px. */
export function glowCoverage(oval: GlowOval, px: number, py: number, w: number, h: number): number {
  const rx = (oval.rx * w) / 100;
  const ry = (oval.ry * h) / 100;

  return falloffCss(Math.hypot((px - (oval.x * w) / 100) / rx, (py - (oval.y * h) / 100) / ry));
}

/**
 * Grano estático (BLOG-156): un mosaico de `size` px (scripts/build-grain.ts)
 * en que cada píxel es blanco o negro con un alfa al azar, pintado con
 * `opacity` encima de las manchas. Basta para romper las bandas de 1/255 de
 * los degradados sin verse como textura. Su peor caso (un píxel blanco o
 * negro opaco) entra en el test de contraste.
 */
export const AURORA_GRAIN = {
  src: '/img/aurora-grano.png',
  size: 128,
  opacity: { light: 0.012, dark: 0.006 },
} as const;

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

    return opacity * falloffCss(Math.hypot(px - cx, py - cy) / r);
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

/** Las manchas que se pintan en una pantalla de `w` px de ancho. */
export function visibleBlobs(w: number): readonly AuroraBlob[] {
  return w < AURORA_MOBILE_MAX_PX ? AURORA_BLOBS.filter((b) => b.mobile) : AURORA_BLOBS;
}

/**
 * Los colores que puede tener el punto (px, py): el lienzo con cada mancha
 * visible encima, en el orden del DOM, con cualquier opacidad entre 0 y su
 * máximo en ese punto. Las duraciones no tienen un múltiplo común cercano,
 * así que cualquier combinación de fases llega a darse.
 *
 * La composición «over» en sRGB (como la hace el navegador) es lineal en la
 * opacidad y creciente en el color de abajo: el extremo de cada canal sale de
 * opacidad 0 o de la máxima, siguiendo el mínimo y el máximo de cada canal.
 * Medir en el extremo de cada canal es del lado seguro: no todas las esquinas
 * de la caja se dan a la vez.
 */
export function colorBox(
  bg: string,
  mode: AuroraMode,
  px: number,
  py: number,
  w: number,
  h: number,
): ColorBox {
  const lo = [...parseHex(bg)];
  const hi = [...lo];

  // El resplandor es estático: un solo color encima del lienzo.
  const glowAlpha = glowAlphaFor(mode, w);
  for (const oval of AURORA_GLOW_OVALS) {
    const a = glowCoverage(oval, px, py, w, h) * glowAlpha;
    if (a === 0) continue;
    const tone = parseHex(oval.tone[mode]);
    for (let c = 0; c < 3; c++) {
      lo[c] = (lo[c] ?? 0) * (1 - a) + (tone[c as 0]) * a;
      hi[c] = (hi[c] ?? 0) * (1 - a) + (tone[c as 0]) * a;
    }
  }

  for (const blob of visibleBlobs(w)) {
    const a = maxCoverage(blob, px, py, w, h) * alphaFor(blob, mode, w);
    if (a === 0) continue;
    const tone = parseHex(blob.tone[mode]);
    for (let c = 0; c < 3; c++) {
      const over = (v: number) => v * (1 - a) + (tone[c as 0]) * a;
      lo[c] = Math.min(lo[c] ?? 1, over(lo[c] ?? 1));
      hi[c] = Math.max(hi[c] ?? 0, over(hi[c] ?? 0));
    }
  }

  // El grano, encima de todo: cada píxel puede ir de negro a blanco.
  const grain = AURORA_GRAIN.opacity[mode];
  for (let c = 0; c < 3; c++) {
    lo[c] = (lo[c] ?? 0) * (1 - grain);
    hi[c] = (hi[c] ?? 0) * (1 - grain) + grain;
  }

  return { lo: lo as unknown as Rgb, hi: hi as unknown as Rgb };
}

function cssRgb(hex: string): string {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

function pct(t: number): string {
  return `${String(Math.round(t * 1000) / 10)}%`;
}

/** Degradado de una mancha: lee el tono y el alfa de variables CSS. */
export function blobGradient(toneVar: string, alphaVar: string): string {
  const stops = FALLOFF.map(([t, g]) => `rgb(var(${toneVar}) / calc(var(${alphaVar}) * ${String(g)})) ${pct(t)}`);

  return `radial-gradient(closest-side, ${stops.join(', ')})`;
}

/** Variable CSS con el tono (`r g b`) de un óvalo del resplandor. */
export function glowToneVar(oval: GlowOval): `--${string}` {
  return `--aurora-glow-${oval.name}`;
}

/** Tonos del resplandor de un modo, como variables CSS. */
export function glowToneVars(mode: AuroraMode): Record<`--${string}`, string> {
  return Object.fromEntries(AURORA_GLOW_OVALS.map((oval) => [glowToneVar(oval), cssRgb(oval.tone[mode])]));
}

/**
 * Fondo del resplandor, escrito una sola vez: los tonos y el alfa salen de
 * variables CSS (`glowToneVars` y `--aurora-glow-alpha`), que cambian por
 * modo y ancho. El primer óvalo de la lista va arriba en CSS.
 */
export function glowGradient(): string {
  return [...AURORA_GLOW_OVALS]
    .reverse()
    .map((oval) => {
      const stops = FALLOFF.map(([t, g]) => `rgb(var(${glowToneVar(oval)}) / calc(var(--aurora-glow-alpha) * ${String(g)})) ${pct(t)}`);

      return `radial-gradient(${String(oval.rx)}vw ${String(oval.ry)}vh at ${String(oval.x)}vw ${String(oval.y)}vh, ${stops.join(', ')})`;
    })
    .join(', ');
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
