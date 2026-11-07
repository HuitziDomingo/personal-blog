// Verifica el contraste WCAG 2.x AA de cada paleta de acento de styles.css, en
// claro y en oscuro (BLOG-017). Solo usa módulos de Node: no agrega
// dependencias.
//
// Lee las variables de :root, :root.dark y de los bloques [data-accent='…'], y
// las combina en el orden en que las aplica la cascada. Convierte los colores
// oklch a sRGB y calcula la relación de contraste. Los colores fuera de sRGB se
// recortan por canal, no con el mapeo de gamut de CSS Color 4 que usa el
// navegador: la diferencia es de centésimas, así que un valor pegado al umbral
// merece margen.
//
// El texto sobre el glass (barra superior y offcanvas) se mide con
// foreground, sidebar-foreground y sidebar-accent-foreground. muted-foreground
// no cumple sobre el glass en el peor caso, así que el shell y el menú no lo
// usan; theme-glass-text.test.mjs lo comprueba.
//
// Uso: node scripts/check-theme-contrast.mjs [ruta de styles.css]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_STYLES = fileURLToPath(new URL('../src/styles.css', import.meta.url));

/** Opacidad del fondo de las superficies con efecto glass (bg-background/80). */
export const GLASS_ALPHA = 0.8;

const TEXT = 4.5;
const NON_TEXT = 3;

// --- Color -------------------------------------------------------------------

/** Convierte `oklch(L C H)` (L en 0–1 o en %) a sRGB lineal recortado a [0, 1]. */
export function oklchToLinearSrgb(value) {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (!match) {
    throw new Error(`color no soportado: ${value}`);
  }
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const chroma = Number(match[3]);
  const hue = (Number(match[4]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clip = (channel) => Math.min(1, Math.max(0, channel));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Luminancia relativa de WCAG a partir de sRGB lineal. */
export function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Mezcla `top` con opacidad `alpha` sobre `bottom`, en sRGB codificado, como el navegador. */
export function composite(top, alpha, bottom) {
  return top.map((channel, i) => decode(alpha * encode(channel) + (1 - alpha) * encode(bottom[i])));
}

const BLACK = [0, 0, 0];
const WHITE = [1, 1, 1];

// --- CSS ---------------------------------------------------------------------

/** Bloques `selector { --var: valor; }` sin anidar, con sus variables. */
function blocks(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
    // Lo anterior al último `;` son sentencias como @import, no el selector.
    selectors: prelude
      .slice(prelude.lastIndexOf(';') + 1)
      .split(',')
      .map((part) => part.trim()),
    vars: Object.fromEntries(
      [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
    ),
  }));
}

/** Variables declaradas en los bloques con exactamente ese selector. */
export function variablesOf(css, selector) {
  const found = blocks(css).filter((block) => block.selectors.includes(selector));
  return Object.assign({}, ...found.map((block) => block.vars));
}

/**
 * Variables efectivas en `<html>` para cada modo y acento, en el orden de la
 * cascada: `[data-accent]` (0,1,0) le gana a `:root` por ir después, pero no a
 * `:root.dark` (0,2,0); `.dark[data-accent]` empata con `:root.dark` y le gana
 * por ir después.
 */
export function themes(css) {
  const all = blocks(css);
  const find = (selector) => {
    const found = all.filter((block) => block.selectors.includes(selector));
    return Object.assign({}, ...found.map((block) => block.vars));
  };

  const accents = [
    ...new Set(
      all.flatMap((block) =>
        block.selectors.flatMap((selector) => /^\[data-accent='([\w-]+)'\]$/.exec(selector)?.[1] ?? []),
      ),
    ),
  ];

  const result = [];
  for (const accent of accents) {
    const light = find(`[data-accent='${accent}']`);
    const dark = find(`.dark[data-accent='${accent}']`);
    result.push({ accent, mode: 'light', vars: { ...find(':root'), ...light } });
    result.push({ accent, mode: 'dark', vars: { ...find(':root'), ...light, ...find(':root.dark'), ...dark } });
  }
  return { accents, themes: result };
}

/** Comprobaciones de contraste de un tema: devuelve una fila por par de colores. */
export function checks({ vars }) {
  const color = (name) => {
    if (!vars[name]) {
      throw new Error(`falta la variable ${name}`);
    }
    return oklchToLinearSrgb(vars[name]);
  };

  const background = color('--background');
  const foreground = color('--foreground');
  const primary = color('--primary');
  // Lo que se ve detrás del glass, en el peor caso: negro o blanco al 100 %.
  const glass = [BLACK, WHITE].map((behind) => composite(background, GLASS_ALPHA, behind));
  const worstOnGlass = (fg) => Math.min(...glass.map((bg) => contrast(fg, bg)));

  return [
    { pair: 'Texto principal (foreground / background)', ratio: contrast(foreground, background), min: TEXT },
    { pair: 'Texto del menú (sidebar-foreground / sidebar)', ratio: contrast(color('--sidebar-foreground'), color('--sidebar')), min: TEXT },
    { pair: 'Texto secundario (muted-foreground / background)', ratio: contrast(color('--muted-foreground'), background), min: TEXT },
    { pair: 'Botón primario (primary-foreground / primary)', ratio: contrast(color('--primary-foreground'), primary), min: TEXT },
    { pair: 'Acento sobre el fondo (primary / background)', ratio: contrast(primary, background), min: NON_TEXT },
    { pair: 'Acento sobre el menú (sidebar-primary / sidebar)', ratio: contrast(color('--sidebar-primary'), color('--sidebar')), min: NON_TEXT },
    { pair: 'Texto sobre el glass, peor caso', ratio: worstOnGlass(foreground), min: TEXT },
    { pair: 'Texto del menú sobre el glass, peor caso', ratio: worstOnGlass(color('--sidebar-foreground')), min: TEXT },
    { pair: 'Link activo (sidebar-accent-foreground / sidebar-accent)', ratio: contrast(color('--sidebar-accent-foreground'), color('--sidebar-accent')), min: TEXT },
    { pair: 'Acento sobre el glass, peor caso', ratio: worstOnGlass(primary), min: NON_TEXT },
  ];
}

// --- CLI ---------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? DEFAULT_STYLES;
  const { themes: all } = themes(readFileSync(path, 'utf8'));
  let failed = 0;
  for (const theme of all) {
    for (const row of checks(theme)) {
      const ok = row.ratio >= row.min;
      failed += ok ? 0 : 1;
      console.log(
        `${ok ? 'ok ' : 'MAL'} ${theme.accent.padEnd(8)} ${theme.mode.padEnd(6)} ${row.ratio.toFixed(2).padStart(5)} ≥ ${row.min}  ${row.pair}`,
      );
    }
  }
  if (failed > 0) {
    console.error(`check-theme-contrast: ${failed} pares no cumplen WCAG AA`);
    process.exit(1);
  }
  console.log(`check-theme-contrast: ${all.length} temas cumplen WCAG AA`);
}
