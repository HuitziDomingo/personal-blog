import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentIslandModel, FORTRESS, islandModelFor, previewModelsEnabled } from './island-model';
import { HONGO } from './island-model-hongo';

describe('previewModelsEnabled', () => {
  it('solo en desarrollo y en los previews de Vercel', () => {
    expect(previewModelsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe(true);
    expect(previewModelsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production' })).toBe(false);
    expect(previewModelsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(previewModelsEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(previewModelsEnabled({})).toBe(false);
  });
});

describe('islandModelFor', () => {
  it('con la guarda activa, ?isla=hongo carga el Rey Hongo', () => {
    expect(islandModelFor('?isla=hongo', true)).toBe(HONGO);
    expect(islandModelFor('?foo=1&isla=hongo', true)).toBe(HONGO);
  });

  it('sin la guarda (producción), siempre la fortaleza', () => {
    expect(islandModelFor('?isla=hongo', false)).toBe(FORTRESS);
  });

  it('sin parámetro, o con uno que no existe, la fortaleza', () => {
    expect(islandModelFor('', true)).toBe(FORTRESS);
    expect(islandModelFor('?isla=castillo', true)).toBe(FORTRESS);
    expect(islandModelFor('?isla=toString', true)).toBe(FORTRESS);
    expect(islandModelFor('?isla=__proto__', true)).toBe(FORTRESS);
  });
});

describe('currentIslandModel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('lee window.location y las variables del entorno', () => {
    vi.stubGlobal('window', { location: { search: '?isla=hongo' } });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(currentIslandModel()).toBe(HONGO);

    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(currentIslandModel()).toBe(FORTRESS);
  });
});
