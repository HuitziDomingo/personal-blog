import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentIslandModel, DEFAULT_MODEL, FORTRESS, islandModelFor, previewModelsEnabled } from './island-model';
import { HONGO } from './island-model-hongo';
import { MEDIEVAL } from './island-model-medieval';

describe('DEFAULT_MODEL', () => {
  it('la portada usa el Rey Hongo mientras León lo evalúa', () => {
    expect(DEFAULT_MODEL).toBe(HONGO);
  });
});

describe('previewModelsEnabled', () => {
  it('en desarrollo, en los previews de Vercel y en un build local con NEXT_PUBLIC_ISLAND_MODELS=1', () => {
    expect(previewModelsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe(true);
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_ISLAND_MODELS: '1' })).toBe(true);
  });

  it('en producción, nunca: ni en la de Vercel con la variable puesta', () => {
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production' })).toBe(false);
    expect(
      previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production', NEXT_PUBLIC_ISLAND_MODELS: '1' }),
    ).toBe(false);
    expect(previewModelsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_ISLAND_MODELS: 'true' })).toBe(false);
    expect(previewModelsEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(previewModelsEnabled({})).toBe(false);
  });
});

describe('islandModelFor', () => {
  it('con la guarda activa, ?isla= elige el modelo', () => {
    expect(islandModelFor('?isla=fortaleza', true)).toBe(FORTRESS);
    expect(islandModelFor('?isla=hongo', true)).toBe(HONGO);
    expect(islandModelFor('?isla=medieval', true)).toBe(MEDIEVAL);
    expect(islandModelFor('?foo=1&isla=fortaleza', true)).toBe(FORTRESS);
  });

  it('sin la guarda (producción), siempre el de la portada', () => {
    expect(islandModelFor('?isla=fortaleza', false)).toBe(DEFAULT_MODEL);
    expect(islandModelFor('?isla=medieval', false)).toBe(DEFAULT_MODEL);
  });

  it('sin parámetro, o con uno que no existe, el de la portada', () => {
    expect(islandModelFor('', true)).toBe(DEFAULT_MODEL);
    expect(islandModelFor('?isla=castillo', true)).toBe(DEFAULT_MODEL);
    expect(islandModelFor('?isla=toString', true)).toBe(DEFAULT_MODEL);
    expect(islandModelFor('?isla=__proto__', true)).toBe(DEFAULT_MODEL);
  });
});

describe('currentIslandModel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('lee window.location y las variables del entorno', () => {
    vi.stubGlobal('window', { location: { search: '?isla=fortaleza' } });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(currentIslandModel()).toBe(FORTRESS);

    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(currentIslandModel()).toBe(DEFAULT_MODEL);
  });
});
