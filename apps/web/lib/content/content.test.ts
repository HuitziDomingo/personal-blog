import { describe, expect, it } from 'vitest';

import { works } from '../site';

import { en } from './en';
import { es } from './es';
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

describe('traducciones', () => {
  // Los textos que coinciden a propósito en los dos idiomas: nombres propios,
  // años y palabras que el inglés usa igual. Cualquier otro texto en inglés
  // idéntico al español es una traducción que falta.
  it('el inglés solo repite el español donde es el mismo texto', () => {
    const spanish = new Map(leaves(es));
    const same = leaves(en)
      .filter(([path, text]) => text !== '' && spanish.get(path) === text)
      .map(([path]) => path);
    expect(same).toEqual([
      'profile.authorBadge',
      'profile.authorRole',
      'bio[2].period',
      'bio[3].period',
      'bio[4].period',
      'ui.nav.blog',
      'ui.works.website',
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
