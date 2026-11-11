/**
 * Forma de los textos del sitio en un idioma (ADR-024, punto 3). `es.ts` y
 * `en.ts` cumplen el mismo tipo: si falta un texto en uno de los dos, el
 * build no compila.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Ids de los trabajos; cada idioma tiene que traer el texto de todos. */
export const WORK_IDS = ['huitzi-xyz', 'debred', 'youtube', 'dalyza', 'aum'] as const;
export type WorkId = (typeof WORK_IDS)[number];

export interface BioEntry {
  period: string;
  /** En negritas. `{debred}` marca dónde va el link a Debred. */
  title: string;
  description?: string;
}

export interface WorkText {
  /** Texto de la tarjeta en /works y descripción de la página. */
  summary: string;
  /** Párrafos de cada sección de la página del trabajo, en el orden de sus imágenes. */
  sections: readonly (readonly string[])[];
  /** Texto alternativo de cada imagen, en el mismo orden. */
  imageAlts: readonly string[];
}

export interface SiteContent {
  locale: Locale;
  /** `lang` del `<html>`. */
  htmlLang: string;
  /** Locale de Open Graph. */
  ogLocale: string;
  /** Locale de `Intl` para fechas y números (ADR-024, punto 6). */
  intlLocale: string;

  profile: {
    greeting: string;
    tagline: string;
    /** Etiqueta de la tarjeta de autor. */
    authorBadge: string;
    /** Rol de la tarjeta de autor. */
    authorRole: string;
  };
  /** Descripción del sitio (SEO, Open Graph y RSS). */
  siteDescription: string;
  /** Párrafos de «Acerca de mí». `{debred}` marca dónde va el link a Debred. */
  about: readonly string[];
  bio: readonly BioEntry[];
  works: Readonly<Record<WorkId, WorkText>>;

  ui: {
    skipLink: string;
    homeLinkLabel: string;
    primaryNav: string;
    nav: { home: string; works: string; blog: string };
    /** Aviso junto al link al blog, que solo existe en español (ADR-024, punto 1). */
    blogLanguageNote: string;
    menuLabel: string;
    colorMode: { group: string; change: string; current: string; light: string; dark: string; system: string };
    /** Link a la página equivalente en el otro idioma (ADR-024, punto 7). */
    languageSwitch: { label: string; hrefLang: Locale; lang: string };
    footer: { social: string; rss: string };
    home: {
      photoAlt: string;
      about: string;
      bio: string;
      latestPosts: string;
      noPosts: string;
      allPosts: string;
      worksButton: string;
      onTheWeb: string;
    };
    works: { title: string; description: string; breadcrumb: string; website: string };
    error: { title: string; body: string; retry: string };
  };
}
