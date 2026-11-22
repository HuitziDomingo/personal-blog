// Fondos de pantalla del admin, en pares claro y oscuro (BLOG-121). Como
// theme.ts, este archivo no importa nada: lo leen con Node los scripts que
// generan y miden las imágenes, y el test del script de index.html.
//
// Vienen de gnome-backgrounds 51.0.1 (CC BY-SA 3.0) y de los paquetes de
// fondos de Fedora 42, 43 y 44 (CC BY-SA 4.0). Autor y licencia de cada uno,
// verificados en su fuente: CREDITS.md (BLOG-146).

export const BACKGROUNDS = [
  'fold',
  'map',
  'sheet',
  'blobs',
  'glass-chip',
  'tarka',
  'curvy',
  'symbolic',
  'dithered-sun',
  'balls',
  'blendpills',
  'lcd-rainbow',
  'fedora-42',
  'fedora-43',
  'fedora-44',
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

/** Fondo del menú cuando no hay uno guardado. */
export const DEFAULT_BACKGROUND: BackgroundId = 'fold';

export const BACKGROUND_VARIANTS = ['light', 'dark'] as const;
export type BackgroundVariant = (typeof BACKGROUND_VARIANTS)[number];

/** Recortes: apaisado para escritorio y tablet en horizontal, vertical para móvil. */
export const BACKGROUND_ORIENTATIONS = ['landscape', 'portrait'] as const;
export type BackgroundOrientation = (typeof BACKGROUND_ORIENTATIONS)[number];

/** Proporción (ancho / alto) de cada recorte: 16:10 apaisado y 9:16 vertical. */
export const BACKGROUND_ASPECTS: Readonly<Record<BackgroundOrientation, number>> = {
  landscape: 16 / 10,
  portrait: 9 / 16,
};

/**
 * Anchos de cada recorte (BLOG-146). Sin ampliar: si el recorte del original
 * es más angosto que uno de estos anchos, ese y los mayores se omiten y el
 * mayor pasa a ser el ancho del original (backgroundWidths).
 */
export const BACKGROUND_WIDTHS = [1280, 1920, 2560, 3840] as const;

export const BACKGROUND_FORMATS = ['avif', 'webp'] as const;
export type BackgroundFormat = (typeof BACKGROUND_FORMATS)[number];

/**
 * Ancho máximo de cada formato (BLOG-147): AVIF llega a 3840; WebP es solo el
 * respaldo de los navegadores sin AVIF y se queda en 2560.
 */
export const BACKGROUND_MAX_WIDTHS: Readonly<Record<BackgroundFormat, number>> = { avif: 3840, webp: 2560 };

/** Media query del recorte vertical. El apaisado es el que queda. */
export const PORTRAIT_QUERY = '(orientation: portrait)';

/**
 * Ancho con el que se dibuja cada recorte, para el atributo sizes: con
 * object-fit: cover llena el viewport, así que mide el ancho del viewport o
 * el alto por la proporción, el mayor de los dos.
 */
export const BACKGROUND_SIZES_ATTRIBUTE: Readonly<Record<BackgroundOrientation, string>> = {
  landscape: 'max(100vw, 160vh)',
  portrait: 'max(100vw, 56.25vh)',
};

export interface BackgroundSource {
  name: string;
  /** Proyecto o paquete. */
  projectUrl: string;
  /** Descarga exacta de la versión usada. */
  releaseUrl: string;
  license: string;
  licenseUrl: string;
}

export const BACKGROUND_SOURCES = {
  'gnome-51': {
    name: 'gnome-backgrounds 51.0.1',
    projectUrl: 'https://gitlab.gnome.org/GNOME/gnome-backgrounds',
    releaseUrl: 'https://download.gnome.org/sources/gnome-backgrounds/51/gnome-backgrounds-51.0.1.tar.xz',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  'fedora-42': {
    name: 'f42-backgrounds 42.0.0 (Fedora 42)',
    projectUrl: 'https://src.fedoraproject.org/rpms/f42-backgrounds',
    releaseUrl: 'https://github.com/fedoradesign/backgrounds/releases/download/v42.0.0/f42-backgrounds-42.0.0.tar.xz',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  'fedora-43': {
    name: 'f43-backgrounds 43.0.4 (Fedora 43)',
    projectUrl: 'https://src.fedoraproject.org/rpms/f43-backgrounds',
    releaseUrl: 'https://github.com/fedoradesign/backgrounds/releases/download/v43.0.4/f43-backgrounds-43.0.4.tar.xz',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  'fedora-44': {
    name: 'f44-backgrounds 44.0.0 (Fedora 44)',
    projectUrl: 'https://src.fedoraproject.org/rpms/f44-backgrounds',
    releaseUrl: 'https://forge.fedoraproject.org/design/backgrounds/releases/download/v44.0.0/f44-backgrounds-44.0.0.tar.xz',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
} as const satisfies Record<string, BackgroundSource>;
export type BackgroundSourceId = keyof typeof BACKGROUND_SOURCES;

export interface BackgroundInfo {
  label: string;
  author: string;
  source: BackgroundSourceId;
  /** Archivos de origen, relativos a la raíz del tarball de su fuente. */
  files: Readonly<Record<BackgroundVariant, string>>;
  /** Tamaño del original en píxeles (los SVG se rasterizan a este tamaño). */
  size: { width: number; height: number };
}

const GNOME = { source: 'gnome-51', size: { width: 4096, height: 4096 } } as const;

function gnome(label: string, author: string, name: string, extension = 'jxl'): BackgroundInfo {
  return {
    label,
    author,
    ...GNOME,
    files: { light: `backgrounds/${name}-l.${extension}`, dark: `backgrounds/${name}-d.${extension}` },
  };
}

function fedora(label: string, release: 42 | 43 | 44, size: { width: number; height: number }): BackgroundInfo {
  return {
    label,
    author: 'Fedora Design Team',
    source: `fedora-${release}`,
    files: { light: `default/f${release}-01-day.jxl`, dark: `default/f${release}-01-night.jxl` },
    size,
  };
}

export const BACKGROUND_INFO: Readonly<Record<BackgroundId, BackgroundInfo>> = {
  fold: gnome('Pliegue', 'Jakub Steiner', 'fold'),
  map: gnome('Mapa', 'Dominik Baran', 'map', 'svg'),
  sheet: gnome('Lámina', 'Jakub Steiner', 'sheet'),
  blobs: gnome('Burbujas', 'Jakub Steiner', 'blobs', 'svg'),
  'glass-chip': gnome('Chip de vidrio', 'Jakub Steiner', 'glass-chip'),
  tarka: gnome('Tarka', 'Jakub Steiner', 'tarka'),
  curvy: gnome('Curvas', 'Jakub Steiner', 'curvy'),
  symbolic: gnome('Símbolos', 'Jakub Steiner', 'symbolic'),
  'dithered-sun': gnome('Sol tramado', 'Tobias Bernard', 'dithered-sun'),
  balls: gnome('Esferas', 'Jakub Steiner', 'balls'),
  blendpills: gnome('Píldoras de colores', 'Jakub Steiner', 'blendpills'),
  'lcd-rainbow': gnome('Arcoíris LCD', 'Jakub Steiner', 'lcd-rainbow'),
  'fedora-42': fedora('Bosque (Fedora 42)', 42, { width: 4032, height: 3024 }),
  'fedora-43': fedora('Despegue (Fedora 43)', 43, { width: 4032, height: 3024 }),
  'fedora-44': fedora('Ciudad (Fedora 44)', 44, { width: 4096, height: 4096 }),
};

/** Ancho del mayor recorte centrado con la proporción de `orientation` que cabe en el original. */
export function maxCropWidth(id: BackgroundId, orientation: BackgroundOrientation): number {
  const { width, height } = BACKGROUND_INFO[id].size;
  return Math.min(width, Math.floor(height * BACKGROUND_ASPECTS[orientation]));
}

/**
 * Anchos de un recorte en un formato: los de BACKGROUND_WIDTHS que caben en el
 * original y no pasan del máximo del formato y, si el original no llega a ese
 * máximo, el ancho del original en su lugar (sin ampliar).
 */
export function backgroundWidths(id: BackgroundId, orientation: BackgroundOrientation, format: BackgroundFormat): number[] {
  const max = Math.min(maxCropWidth(id, orientation), BACKGROUND_MAX_WIDTHS[format]);
  const fitting = BACKGROUND_WIDTHS.filter((width) => width <= max);
  return fitting.at(-1) === max ? fitting : [...fitting, max];
}

/** Alto de un recorte de ese ancho. */
export function backgroundHeight(orientation: BackgroundOrientation, width: number): number {
  return Math.round(width / BACKGROUND_ASPECTS[orientation]);
}

/** Clave de localStorage del fondo elegido. */
export const BACKGROUND_STORAGE_KEY = 'admin-background';

/** Atributo de <html> con el fondo que eligió el script de index.html (el del login es aleatorio). */
export const BACKGROUND_ATTRIBUTE = 'data-background';

/**
 * Atributo de <html> con el fondo visible, `<id>-<light|dark>`, que pone
 * AppBackdrop: styles.css elige con él el tinte de las cards de vidrio
 * (BLOG-143).
 */
export const GLASS_BACKDROP_ATTRIBUTE = 'data-glass-backdrop';

/** Ruta de una variante dentro de public/ (sin barra inicial: va relativa al <base href>). */
export function backgroundPath(
  id: BackgroundId,
  variant: BackgroundVariant,
  orientation: BackgroundOrientation,
  width: number,
  format: BackgroundFormat,
): string {
  return `backgrounds/${id}-${variant}-${orientation}-${width}.${format}`;
}

/** srcset de un recorte en un formato, con todos sus anchos. */
export function backgroundSrcset(
  id: BackgroundId,
  variant: BackgroundVariant,
  orientation: BackgroundOrientation,
  format: BackgroundFormat,
): string {
  return backgroundWidths(id, orientation, format)
    .map((width) => `${backgroundPath(id, variant, orientation, width, format)} ${width}w`)
    .join(', ');
}

/** Miniatura del selector del menú: webp pequeño, uno por fondo y versión. */
export const THUMBNAIL_SIZE = { width: 160, height: 120 } as const;

export function thumbnailPath(id: BackgroundId, variant: BackgroundVariant): string {
  return `backgrounds/${id}-${variant}-thumb.webp`;
}

export function isBackground(value: unknown): value is BackgroundId {
  return (BACKGROUNDS as readonly unknown[]).includes(value);
}
