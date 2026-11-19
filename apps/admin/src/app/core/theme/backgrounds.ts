// Fondos de pantalla del admin, en pares claro y oscuro (BLOG-121). Como
// theme.ts, este archivo no importa nada: lo leen con Node los scripts que
// generan y miden las imágenes, y el test del script de index.html.
//
// Todos vienen de gnome-backgrounds 51.0.1 y son CC BY-SA 3.0; autor y
// licencia, verificados en los metadatos XMP de cada archivo (CREDITS.md).

export const BACKGROUNDS = ['fold', 'map', 'sheet', 'blobs', 'glass-chip', 'tarka', 'curvy', 'symbolic', 'dithered-sun'] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

/** Fondo del menú cuando no hay uno guardado. */
export const DEFAULT_BACKGROUND: BackgroundId = 'fold';

export const BACKGROUND_VARIANTS = ['light', 'dark'] as const;
export type BackgroundVariant = (typeof BACKGROUND_VARIANTS)[number];

/** Recortes: apaisado para escritorio y tablet en horizontal, vertical para móvil. */
export const BACKGROUND_ORIENTATIONS = ['landscape', 'portrait'] as const;
export type BackgroundOrientation = (typeof BACKGROUND_ORIENTATIONS)[number];

export const BACKGROUND_SIZES: Readonly<Record<BackgroundOrientation, { width: number; height: number }>> = {
  landscape: { width: 1920, height: 1200 },
  portrait: { width: 900, height: 1600 },
};

/** Media query del recorte vertical. El apaisado es el que queda. */
export const PORTRAIT_QUERY = '(orientation: portrait)';

export interface BackgroundInfo {
  label: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Archivos de origen en gnome-backgrounds 51.0.1 (backgrounds/). */
  files: Readonly<Record<BackgroundVariant, string>>;
}

const CC_BY_SA_3 = { license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' };

export const BACKGROUND_INFO: Readonly<Record<BackgroundId, BackgroundInfo>> = {
  fold: { label: 'Pliegue', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'fold-l.jxl', dark: 'fold-d.jxl' } },
  map: { label: 'Mapa', author: 'Dominik Baran', ...CC_BY_SA_3, files: { light: 'map-l.svg', dark: 'map-d.svg' } },
  sheet: { label: 'Lámina', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'sheet-l.jxl', dark: 'sheet-d.jxl' } },
  blobs: { label: 'Burbujas', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'blobs-l.svg', dark: 'blobs-d.svg' } },
  'glass-chip': {
    label: 'Chip de vidrio',
    author: 'Jakub Steiner',
    ...CC_BY_SA_3,
    files: { light: 'glass-chip-l.jxl', dark: 'glass-chip-d.jxl' },
  },
  tarka: { label: 'Tarka', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'tarka-l.jxl', dark: 'tarka-d.jxl' } },
  curvy: { label: 'Curvas', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'curvy-l.jxl', dark: 'curvy-d.jxl' } },
  symbolic: { label: 'Símbolos', author: 'Jakub Steiner', ...CC_BY_SA_3, files: { light: 'symbolic-l.jxl', dark: 'symbolic-d.jxl' } },
  'dithered-sun': {
    label: 'Sol tramado',
    author: 'Tobias Bernard',
    ...CC_BY_SA_3,
    files: { light: 'dithered-sun-l.jxl', dark: 'dithered-sun-d.jxl' },
  },
};

/** De dónde salen los fondos: la página de créditos lo cita (BLOG-130). */
export const BACKGROUNDS_SOURCE = {
  name: 'gnome-backgrounds 51.0.1',
  projectUrl: 'https://gitlab.gnome.org/GNOME/gnome-backgrounds',
  releaseUrl: 'https://download.gnome.org/sources/gnome-backgrounds/51/',
} as const;

/** Clave de localStorage. El script de index.html usa la misma. */
export const BACKGROUND_STORAGE_KEY = 'admin-background';

/** Atributo de <html> con el fondo que eligió el script de index.html (el del login es aleatorio). */
export const BACKGROUND_ATTRIBUTE = 'data-background';

/** Ruta del archivo dentro de public/ (sin barra inicial: va relativa al <base href>). */
export function backgroundPath(id: BackgroundId, variant: BackgroundVariant, orientation: BackgroundOrientation): string {
  return `backgrounds/${id}-${variant}-${orientation}.avif`;
}

/** Miniatura del selector del menú: webp pequeño, uno por fondo y versión. */
export const THUMBNAIL_SIZE = { width: 160, height: 120 } as const;

export function thumbnailPath(id: BackgroundId, variant: BackgroundVariant): string {
  return `backgrounds/${id}-${variant}-thumb.webp`;
}

export function isBackground(value: unknown): value is BackgroundId {
  return (BACKGROUNDS as readonly unknown[]).includes(value);
}
