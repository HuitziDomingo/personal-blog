import { TestBed } from '@angular/core/testing';

import { MILKDOWN_THEME_HREF, MILKDOWN_THEME_LOADER } from './milkdown-theme';

describe('MILKDOWN_THEME_LOADER', () => {
  const links = () => document.head.querySelectorAll<HTMLLinkElement>(`link[rel="stylesheet"][href="${MILKDOWN_THEME_HREF}"]`);

  afterEach(() => links().forEach((link) => link.remove()));

  it('agrega un solo <link> a la hoja del tema y resuelve cuando carga', async () => {
    const loader = TestBed.inject(MILKDOWN_THEME_LOADER);

    const first = loader.load();
    const second = loader.load();
    expect(second).toBe(first);
    expect(links()).toHaveLength(1);

    links()[0]?.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('si la hoja no carga, resuelve igual: el editor funciona sin tema', async () => {
    const loading = TestBed.inject(MILKDOWN_THEME_LOADER).load();

    links()[0]?.dispatchEvent(new Event('error'));

    await expect(loading).resolves.toBeUndefined();
  });
});
