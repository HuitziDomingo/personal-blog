/**
 * Forma de los textos del sitio en un idioma (ADR-024, punto 3). `es.ts` y
 * `en.ts` cumplen el mismo tipo: si falta un texto en uno de los dos, el
 * build no compila.
 */

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Ids de los trabajos; cada idioma tiene que traer el texto de todos. */
export const WORK_IDS = [
  "santo-sazon",
  "huitzi-xyz",
  "debred",
  "youtube",
  "dalyza",
  "aum",
] as const;
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

/** Un puesto del CV (ADR-028, punto 2). */
export interface CvJob {
  role: string;
  company: string;
  place: string;
  period: string;
  /** Logros, uno por viñeta. */
  points: readonly string[];
}

/** Un área del stack del CV y sus tecnologías. */
export interface CvStackArea {
  area: string;
  items: string;
}

/** Contenido de la página del CV en un idioma (ADR-028, punto 2). Sin teléfono. */
export interface CvContent {
  /** Puesto y especialidad, bajo el nombre. */
  headline: string;
  summary: string;
  experience: readonly CvJob[];
  project: { name: string; meta: string; points: readonly string[] };
  stack: readonly CvStackArea[];
  aiEngineering: readonly string[];
  education: readonly string[];
  inProgress: readonly string[];
  languages: readonly string[];
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
  cv: CvContent;

  ui: {
    skipLink: string;
    homeLinkLabel: string;
    primaryNav: string;
    nav: { home: string; works: string; cv: string; blog: string };
    /** Aviso junto al link al blog, que solo existe en español (ADR-024, punto 1). */
    blogLanguageNote: string;
    /** Botón de la cabecera que descarga el PDF vigente del CV (BLOG-152). */
    cvButton: string;
    menuLabel: string;
    colorMode: {
      group: string;
      change: string;
      current: string;
      light: string;
      dark: string;
      system: string;
    };
    /** Link a la página equivalente en el otro idioma (ADR-024, punto 7). */
    languageSwitch: { label: string; hrefLang: Locale; lang: string };
    footer: { social: string; rss: string };
    home: {
      photoAlt: string;
      /** Isla 3D del hero (BLOG-107). */
      island: {
        /** Texto alternativo de la imagen fija, que también describe la escena 3D. */
        alt: string;
        /** Nombre accesible del canvas interactivo. */
        label: string;
        /**
         * Cómo se maneja la isla: solo para lectores de pantalla (sr-only), que
         * lo anuncian al enfocar el canvas (BLOG-120).
         */
        instructions: string;
        /** Texto del spinner mientras carga el modelo (sr-only, `role="status"`; BLOG-126). */
        loading: string;
      };
      about: string;
      bio: string;
      latestPosts: string;
      noPosts: string;
      allPosts: string;
      worksButton: string;
      onTheWeb: string;
    };
    works: {
      title: string;
      description: string;
      breadcrumb: string;
      website: string;
    };
    /** Página del CV (ADR-028). */
    cv: {
      title: string;
      description: string;
      download: string;
      /** Aclaración del botón para lectores de pantalla: idioma y formato del archivo. */
      downloadDetail: string;
      headings: {
        summary: string;
        experience: string;
        project: string;
        stack: string;
        aiEngineering: string;
        education: string;
        inProgress: string;
        languages: string;
        contact: string;
      };
    };
    error: { title: string; body: string; retry: string };
  };
}
