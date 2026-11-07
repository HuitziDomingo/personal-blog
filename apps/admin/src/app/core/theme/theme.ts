// Preferencias de apariencia del admin. Este archivo no importa nada: los tests
// de scripts/ lo leen con Node para comprobar que el script de index.html y las
// paletas de styles.css usan las mismas listas.

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_MODE_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

/** Paletas de acento. `neutral` es el tema por defecto de Spartan, sin reglas propias en styles.css. */
export const ACCENTS = ['neutral', 'blue', 'green', 'violet', 'amber', 'rose'] as const;
export type Accent = (typeof ACCENTS)[number];

export const ACCENT_LABELS: Readonly<Record<Accent, string>> = {
  neutral: 'Neutro',
  blue: 'Azul',
  green: 'Verde',
  violet: 'Violeta',
  amber: 'Ámbar',
  rose: 'Rosa',
};

/** Claves de localStorage. El script de index.html usa las mismas. */
export const THEME_STORAGE_KEYS = {
  mode: 'admin-theme',
  accent: 'admin-accent',
} as const;

export function isThemeMode(value: unknown): value is ThemeMode {
  return (THEME_MODES as readonly unknown[]).includes(value);
}

export function isAccent(value: unknown): value is Accent {
  return (ACCENTS as readonly unknown[]).includes(value);
}
