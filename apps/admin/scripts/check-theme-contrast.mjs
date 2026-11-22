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
// Cards de vidrio (BLOG-143): el tinte cambia por fondo y modo
// (--glass-card-alpha en styles.css, según data-glass-backdrop en <html>). Se
// compone sobre el color más oscuro y el más claro de cada fondo, ya
// desenfocado y saturado como en el CSS (background-extremes.json), y se mide
// cada color de texto de las cards sobre cada superficie que las cards ponen
// encima (la card, la fila de tabla con hover y, en oscuro, campos y botones
// outline).
//
// Uso: node scripts/check-theme-contrast.mjs [--table | --suggest] [ruta de styles.css]
//   --table   tabla en Markdown: fondo × modo × zona × color → contraste.
//   --suggest el tinte mínimo de cada fondo que cumple AA, con margen.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_STYLES = fileURLToPath(new URL('../src/styles.css', import.meta.url));

/** Opacidad del fondo de las superficies con efecto glass (bg-background/80). */
export const GLASS_ALPHA = 0.8;

/** backdrop-filter de .glass-card en styles.css: blur(CARD_GLASS_BLUR px) saturate(CARD_GLASS_SATURATE). */
export const CARD_GLASS_BLUR = 40;
export const CARD_GLASS_SATURATE = 1.8;

/**
 * Desenfoque con el que measure-backgrounds.mjs mide cada fondo, en píxeles
 * de la imagen. Es menor que el del CSS, que va en píxeles CSS: menos
 * desenfoque deja extremos más extremos, así que la medida sigue del lado
 * seguro mientras la imagen no se amplíe más de 40 / 28 ≈ 1.4 veces (un
 * viewport de hasta ~2700 px CSS de ancho con el recorte apaisado).
 */
export const CARD_GLASS_BLUR_MEASURED = 28;

/** Tinte mínimo de una card aunque el fondo permita menos: sin él la card no se distingue. */
export const CARD_GLASS_MIN_ALPHA = 0.35;

/** Margen sobre el tinte mínimo que cumple AA, para --suggest. */
const CARD_GLASS_MARGIN = 0.02;

/**
 * Colores más oscuro y más claro de cada fondo, ya desenfocado, medidos con
 * scripts/measure-backgrounds.mjs (BLOG-121). Clave: `<fondo>-<light|dark>-<recorte>`.
 */
const EXTREMES = JSON.parse(readFileSync(new URL('../src/app/core/theme/background-extremes.json', import.meta.url), 'utf8'));

/** `#rrggbb` a sRGB lineal. */
export function hexToLinearSrgb(hex) {
  return [1, 3, 5].map((start) => decode(Number.parseInt(hex.slice(start, start + 2), 16) / 255));
}

/**
 * Las zonas de cada fondo de este modo (claro u oscuro): la más oscura y la
 * más clara de cada recorte, ya desenfocadas y saturadas.
 */
export function backdropZones(mode, extremes = EXTREMES) {
  return Object.entries(extremes).flatMap(([key, { darkest, lightest }]) => {
    const match = new RegExp(`^(.+)-${mode}-(landscape|portrait)$`).exec(key);
    if (!match) {
      return [];
    }
    const [, backdrop, orientation] = match;
    return [
      { backdrop, orientation, zone: 'darkest', hex: darkest, color: hexToLinearSrgb(darkest) },
      { backdrop, orientation, zone: 'lightest', hex: lightest, color: hexToLinearSrgb(lightest) },
    ];
  });
}

/** Opacidad del tinte del veredicto sobre el panel (comment-card.css). */
export const VERDICT_TINT = 0.12;

/** Opacidad del panel en la barra de herramientas del editor (markdown-editor.css). */
export const TOOLBAR_ALPHA = 0.85;

const TEXT = 4.5;
const NON_TEXT = 3;

// --- Color -------------------------------------------------------------------

/** Convierte `oklch(L C H)` (L en 0–1 o en %) a sRGB lineal recortado a [0, 1]. */
export function oklchToLinearSrgb(value) {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+%?\s*)?\)$/.exec(value.trim());
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

/** Opacidad de un `oklch(L C H / A)`: 1 si no la tiene. */
export function oklchAlpha(value) {
  const match = /\/\s*([\d.]+)(%?)\s*\)$/.exec(value.trim());
  if (!match) {
    return 1;
  }
  return Number(match[1]) / (match[2] ? 100 : 1);
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

// --- Cards de vidrio ---------------------------------------------------------

/** `55%` o `0.55` a 0.55. */
function parseAlpha(value) {
  const match = /^([\d.]+)(%?)$/.exec(value.trim());
  if (!match) {
    throw new Error(`opacidad no soportada: ${value}`);
  }
  return Number(match[1]) / (match[2] ? 100 : 1);
}

/**
 * El tinte de las cards en cada modo: el de respaldo (`:root` y `:root.dark`,
 * cuando <html> todavía no dice qué fondo se ve o el fondo visible es de otro
 * modo) y el de cada fondo (`:root:not(.dark)[data-glass-backdrop='<id>-light']`
 * y `:root.dark[data-glass-backdrop='<id>-dark']`).
 */
export function cardAlphas(css) {
  const result = { light: { fallback: undefined, backdrops: {} }, dark: { fallback: undefined, backdrops: {} } };
  for (const block of blocks(css)) {
    const value = block.vars['--glass-card-alpha'];
    if (value === undefined) {
      continue;
    }
    for (const selector of block.selectors) {
      if (selector === ':root') {
        result.light.fallback = parseAlpha(value);
      } else if (selector === ':root.dark') {
        result.dark.fallback = parseAlpha(value);
      } else {
        const match = /^:root(?::not\(\.dark\)|\.dark)\[data-glass-backdrop='([\w-]+)-(light|dark)'\]$/.exec(selector);
        if (!match || selector.includes('.dark[') !== (match[2] === 'dark')) {
          throw new Error(`selector de --glass-card-alpha no soportado: ${selector}`);
        }
        result[match[2]].backdrops[match[1]] = parseAlpha(value);
      }
    }
  }
  return result;
}

/**
 * Lo que queda detrás del texto de una card, dado el color de la card:
 * la card misma, una fila de tabla con hover (bg-muted/50) y, en oscuro, los
 * campos y los botones outline (dark:bg-input/30). En claro, los campos son
 * transparentes y los botones outline usan --background, opaco.
 */
function cardSurfaces(vars, mode) {
  const muted = oklchToLinearSrgb(vars['--muted']);
  const surfaces = [
    { surface: 'card', on: (card) => card },
    { surface: 'fila con hover', on: (card) => composite(muted, 0.5 * oklchAlpha(vars['--muted']), card) },
  ];
  if (mode === 'dark') {
    const input = oklchToLinearSrgb(vars['--input']);
    surfaces.push({ surface: 'campo o botón outline', on: (card) => composite(input, 0.3 * oklchAlpha(vars['--input']), card) });
  }
  return surfaces;
}

/** Colores de texto dentro de las cards, con su mínimo de WCAG AA. */
function cardTexts(vars) {
  return [
    { text: 'texto y links (foreground)', name: '--foreground', min: TEXT },
    { text: 'texto secundario (glass-muted-foreground)', name: '--glass-muted-foreground', min: TEXT },
    { text: 'error (glass-destructive)', name: '--glass-destructive', min: TEXT },
  ].map((entry) => ({ ...entry, color: oklchToLinearSrgb(vars[entry.name]) }));
}

/**
 * Una fila por fondo de este modo, recorte, zona, superficie y color de
 * texto, con el tinte de ese fondo; y las mismas con el tinte de respaldo
 * (`backdrop: '*'`, sobre las zonas de todos los fondos del modo).
 */
export function cardRows({ vars, mode }, css, extremes = EXTREMES) {
  const alphas = cardAlphas(css)[mode];
  const tint = oklchToLinearSrgb(vars['--glass-tint']);
  const surfaces = cardSurfaces(vars, mode);
  const texts = cardTexts(vars);
  const zones = backdropZones(mode, extremes);
  const rows = [];
  const measure = (backdrop, alpha, zone) => {
    const card = composite(tint, alpha, zone.color);
    for (const { surface, on } of surfaces) {
      for (const { text, color, min } of texts) {
        rows.push({ backdrop, alpha, orientation: zone.orientation, zone: zone.zone, hex: zone.hex, surface, text, ratio: contrast(color, on(card)), min });
      }
    }
  };
  for (const zone of zones) {
    const alpha = alphas.backdrops[zone.backdrop];
    if (alpha === undefined) {
      throw new Error(`falta --glass-card-alpha para ${zone.backdrop}-${mode}`);
    }
    measure(zone.backdrop, alpha, zone);
    measure('*', alphas.fallback, zone);
  }
  return rows;
}

/** El tinte mínimo de cada fondo de este modo que cumple AA, con margen y redondeado a 5 %. */
export function suggestCardAlphas({ vars, mode }, extremes = EXTREMES) {
  const tint = oklchToLinearSrgb(vars['--glass-tint']);
  const surfaces = cardSurfaces(vars, mode);
  const texts = cardTexts(vars);
  const byBackdrop = Object.groupBy(backdropZones(mode, extremes), (zone) => zone.backdrop);
  return Object.fromEntries(
    Object.entries(byBackdrop).map(([backdrop, zones]) => {
      const passes = (alpha) =>
        zones.every((zone) => {
          const card = composite(tint, alpha, zone.color);
          return surfaces.every(({ on }) => texts.every(({ color, min }) => contrast(color, on(card)) >= min));
        });
      let alpha = 0;
      while (alpha < 1 && !passes(alpha)) {
        alpha = Math.round((alpha + 0.01) * 100) / 100;
      }
      const suggested = Math.min(1, Math.max(CARD_GLASS_MIN_ALPHA, Math.ceil((alpha + CARD_GLASS_MARGIN) * 20) / 20));
      return [backdrop, { needed: alpha, suggested }];
    }),
  );
}

/** Comprobaciones de contraste de un tema: devuelve una fila por par de colores. */
export function checks({ vars, mode }, css) {
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
  // Cards de vidrio: el peor caso de cada fondo de este modo (zonas,
  // superficies y colores de cardRows) y el del tinte de respaldo.
  const cards = Object.values(Object.groupBy(cardRows({ vars, mode }, css), (row) => row.backdrop)).map((rows) => {
    const worst = rows.reduce((low, row) => (row.ratio / row.min < low.ratio / low.min ? row : low));
    const tint = `tinte ${Math.round(worst.alpha * 100)} %`;
    const where = worst.backdrop === '*' ? `${tint} de respaldo, sobre cualquier fondo` : `${worst.backdrop} con ${tint}`;
    return {
      pair: `Card de vidrio, ${where}: peor caso ${worst.text} sobre ${worst.surface}, zona ${worst.zone} de ${worst.backdrop === '*' ? worst.hex : worst.orientation}`,
      ratio: worst.ratio,
      min: worst.min,
    };
  });

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
    // El acento (primary) solo rellena botones y badges dentro de las cards, con
    // su propio texto (primary-foreground / primary, arriba): su borde contra
    // la card no identifica el control, así que no se exige 3:1 (WCAG 1.4.11).
    ...cards,
    // Respaldo sin backdrop-filter o con prefers-reduced-transparency: superficie sólida.
    { pair: 'Texto secundario del vidrio sobre su respaldo sólido (glass-muted-foreground / background)', ratio: contrast(color('--glass-muted-foreground'), background), min: TEXT },
    { pair: 'Error del vidrio sobre su respaldo sólido (glass-destructive / background)', ratio: contrast(color('--glass-destructive'), background), min: TEXT },
    { pair: 'Texto del panel (panel-foreground / panel)', ratio: contrast(color('--panel-foreground'), color('--panel')), min: TEXT },
    { pair: 'Texto secundario del panel (panel-muted-foreground / panel)', ratio: contrast(color('--panel-muted-foreground'), color('--panel')), min: TEXT },
    { pair: 'Código en el panel (panel-foreground / panel-code)', ratio: contrast(color('--panel-foreground'), color('--panel-code')), min: TEXT },
    {
      pair: 'Iconos de la barra del editor sobre su glass, peor caso (panel-foreground / panel al 85 %)',
      ratio: Math.min(...[BLACK, WHITE].map((behind) => contrast(color('--panel-foreground'), composite(color('--panel'), TOOLBAR_ALPHA, behind)))),
      min: TEXT,
    },
    { pair: 'Acento sobre el panel (primary / panel)', ratio: contrast(primary, color('--panel')), min: NON_TEXT },
    { pair: 'Texto secundario en el motivo del modelo (panel-muted-foreground / panel-code)', ratio: contrast(color('--panel-muted-foreground'), color('--panel-code')), min: TEXT },
    { pair: 'Badge del menú (sidebar-primary-foreground / sidebar-primary)', ratio: contrast(color('--sidebar-primary-foreground'), color('--sidebar-primary')), min: TEXT },
    ...['approve', 'reject', 'review'].map((tone) => {
      const fg = color(`--verdict-${tone}`);
      return { pair: `Veredicto ${tone} sobre su tinte (verdict-${tone} / 12 % sobre panel)`, ratio: contrast(fg, composite(fg, VERDICT_TINT, color('--panel'))), min: TEXT };
    }),
    { pair: 'Error sobre el panel: login y tarjeta de la cola (verdict-reject / panel)', ratio: contrast(color('--verdict-reject'), color('--panel')), min: TEXT },
    { pair: 'Botón Rechazar (panel / verdict-reject)', ratio: contrast(color('--panel'), color('--verdict-reject')), min: TEXT },
    { pair: 'Borde de revisión humana (verdict-review / panel)', ratio: contrast(color('--verdict-review'), color('--panel')), min: NON_TEXT },
  ];
}

// --- CLI ---------------------------------------------------------------------

const ZONE_LABELS = { darkest: 'más oscura', lightest: 'más clara' };

/** Tabla en Markdown: el peor ratio de cada fondo, modo, zona y color, entre recortes y superficies. */
function table(css, all) {
  const lines = [
    '| Fondo | Modo | Tinte | Zona | Color de la zona | Texto y links | Secundario | Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const mode of ['light', 'dark']) {
    const theme = all.find((entry) => entry.mode === mode && entry.accent === 'neutral');
    const rows = cardRows(theme, css).filter((row) => row.backdrop !== '*');
    const groups = Object.groupBy(rows, (row) => `${row.backdrop}|${row.zone}`);
    for (const [key, group] of Object.entries(groups)) {
      const [backdrop, zone] = key.split('|');
      const worstOf = (text) => group.filter((row) => row.text === text).reduce((low, row) => (row.ratio < low.ratio ? row : low));
      const cells = [...new Set(group.map((row) => row.text))].map(worstOf);
      const hex = cells.reduce((low, row) => (row.ratio / row.min < low.ratio / low.min ? row : low)).hex;
      lines.push(
        `| ${backdrop} | ${mode === 'light' ? 'claro' : 'oscuro'} | ${Math.round(group[0].alpha * 100)} % | ${ZONE_LABELS[zone]} | \`${hex}\` | ${cells.map((row) => row.ratio.toFixed(2)).join(' | ')} |`,
      );
    }
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = args.find((arg) => arg.startsWith('--'));
  const path = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_STYLES;
  const css = readFileSync(path, 'utf8');
  const { themes: all } = themes(css);

  if (flag === '--table') {
    console.log(table(css, all));
    process.exit(0);
  }
  if (flag === '--suggest') {
    for (const mode of ['light', 'dark']) {
      const theme = all.find((entry) => entry.mode === mode && entry.accent === 'neutral');
      for (const [backdrop, { needed, suggested }] of Object.entries(suggestCardAlphas(theme))) {
        console.log(`${mode.padEnd(6)} ${backdrop.padEnd(13)} cumple desde ${Math.round(needed * 100)} %  →  ${Math.round(suggested * 100)} %`);
      }
    }
    process.exit(0);
  }

  let failed = 0;
  for (const theme of all) {
    for (const row of checks(theme, css)) {
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
