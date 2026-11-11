import { describe, expect, it } from 'vitest';

import { works } from '../site';

import { en } from './en';
import { es } from './es';
import { PENDING_TRANSLATIONS } from './pending';
import { alternateHref, localeOf, localizedPath } from './routes';
import { WORK_IDS } from './types';

/** Todas las hojas de texto de un objeto, con su ruta (`ui.nav.works`). */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${path}[${String(index)}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, path ? `${path}.${key}` : key));
  }

  return [];
}

describe('diccionarios', () => {
  it('tienen las mismas claves en español y en inglés', () => {
    expect(leaves(en).map(([path]) => path)).toEqual(leaves(es).map(([path]) => path));
  });

  it('no dejan ningún texto vacío, salvo el aviso de idioma del blog en español', () => {
    const empty = [...leaves(es), ...leaves(en)].filter(([, text]) => text.trim() === '').map(([path]) => path);
    expect(empty).toEqual(['ui.blogLanguageNote']);
  });

  it('traen el texto de cada trabajo, con un alt por imagen', () => {
    expect(works.map((work) => work.id)).toEqual([...WORK_IDS]);
    for (const content of [es, en]) {
      for (const work of works) {
        const text = content.works[work.id];
        expect(text.imageAlts, `${content.locale}/${work.id}`).toHaveLength(work.images.length);
        expect(text.sections.length, `${content.locale}/${work.id}`).toBeGreaterThanOrEqual(work.images.length);
      }
    }
  });

  it('marcan con {debred} el link a Debred en los dos idiomas', () => {
    const marks = (content: typeof es) =>
      leaves(content)
        .filter(([, text]) => text.includes('{debred}'))
        .map(([path]) => path);
    expect(marks(en)).toEqual(marks(es));
    expect(marks(es)).toEqual(['about[1]', 'bio[5].title']);
  });

  it('declaran el idioma de la página y el del selector', () => {
    expect([es.htmlLang, es.ui.languageSwitch]).toEqual(['es', { label: 'English', hrefLang: 'en', lang: 'en' }]);
    expect([en.htmlLang, en.ui.languageSwitch]).toEqual(['en', { label: 'Español', hrefLang: 'es', lang: 'es' }]);
  });
});

describe('traducciones pendientes', () => {
  // Textos que el documento aprobado no trae en inglés (ADR-024, punto 8).
  // La página en inglés los muestra en español hasta que León los apruebe.
  it('son exactamente estas', () => {
    expect(PENDING_TRANSLATIONS).toEqual([
      '2026 – hoy',
      '2023 – feb 2026',
      '2014 – hoy',
      'Colaboradores freelancers.',
      'Página de inicio de Debred: «Desarrollemos tu proyecto web».',
      'El equipo de Debred posando en una sala.',
      'Canal de YouTube MexicanDevelopers con el video «Instalando React Native, Chocolatey, Yarn y Expo».',
      'Página de inicio de Dalyza: «Dale vida a tu hogar», persianas, alfombras y laminados.',
      'Página de inicio de A.U.M., Acción por la Unidad Mundial.',
      'Saltar al contenido',
      'Huitzitzili León, inicio',
      'Principal',
      'Inicio',
      'Trabajos',
      'en español',
      'Menú de navegación',
      'Tema',
      'Cambiar tema',
      'Tema',
      'Claro',
      'Oscuro',
      'Sistema',
      'Redes',
      'RSS del blog',
      'Foto de Huitzitzili Domingo León Nieves',
      'Acerca de mí',
      'Biografía',
      'Últimos posts',
      'Todavía no hay posts publicados.',
      'Ver todos los posts',
      'Mis trabajos y proyectos',
      'Yo en la web',
      'Trabajos',
      'Mis trabajos y proyectos.',
      'Migas de pan',
      'No pudimos cargar esta página',
      'Inténtalo de nuevo en unos segundos.',
      'Reintentar',
    ]);
  });
});

describe('rutas por idioma', () => {
  it('pone el inglés bajo /en y deja el español en la raíz', () => {
    expect(localizedPath('es', '/works')).toBe('/works');
    expect(localizedPath('en', '/')).toBe('/en');
    expect(localizedPath('en', '/works/debred')).toBe('/en/works/debred');
  });

  it('reconoce el idioma de una ruta', () => {
    expect(['/', '/blog', '/works', '/english'].map(localeOf)).toEqual(['es', 'es', 'es', 'es']);
    expect(['/en', '/en/works', '/en/works/aum'].map(localeOf)).toEqual(['en', 'en', 'en']);
  });

  it('lleva el selector a la página equivalente del otro idioma', () => {
    expect(alternateHref('/', 'es')).toBe('/en');
    expect(alternateHref('/works', 'es')).toBe('/en/works');
    expect(alternateHref('/works/debred', 'es')).toBe('/en/works/debred');
    expect(alternateHref('/en', 'en')).toBe('/');
    expect(alternateHref('/en/works', 'en')).toBe('/works');
    expect(alternateHref('/en/works/debred', 'en')).toBe('/works/debred');
  });

  it('desde el blog, que solo existe en español, lleva al inicio en inglés', () => {
    expect(alternateHref('/blog', 'es')).toBe('/en');
    expect(alternateHref('/blog/un-post', 'es')).toBe('/en');
    expect(alternateHref('/blog/page/2', 'es')).toBe('/en');
  });
});
