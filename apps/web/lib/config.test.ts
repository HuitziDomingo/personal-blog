import { describe, expect, it } from 'vitest';

import { apiBaseUrl, isBuildPhase, siteUrl } from './config';

describe('apiBaseUrl', () => {
  it('usa API_BASE_URL sin barra final', () => {
    expect(apiBaseUrl({ API_BASE_URL: 'https://api.huitzi.xyz//', NODE_ENV: 'production' })).toBe('https://api.huitzi.xyz');
  });

  it('en desarrollo, por defecto, la API local', () => {
    expect(apiBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:8080');
  });

  it('en producción sin API_BASE_URL falla en lugar de publicar un sitio vacío', () => {
    expect(() => apiBaseUrl({ NODE_ENV: 'production' })).toThrow('API_BASE_URL is required');
  });

  it('WEB_SKIP_API=1 nunca vale en Vercel', () => {
    expect(() => apiBaseUrl({ WEB_SKIP_API: '1', VERCEL: '1', NODE_ENV: 'production' })).toThrow('only for CI');
  });

  it('WEB_SKIP_API=1 construye sin API, aunque haya URL', () => {
    expect(apiBaseUrl({ WEB_SKIP_API: '1', API_BASE_URL: 'https://api.huitzi.xyz', NODE_ENV: 'production' })).toBeNull();
  });
});

it('siteUrl por defecto es huitzi.xyz', () => {
  expect(siteUrl({})).toBe('https://huitzi.xyz');
});

it('isBuildPhase solo durante next build', () => {
  expect(isBuildPhase({ NEXT_PHASE: 'phase-production-build' })).toBe(true);
  expect(isBuildPhase({ NEXT_PHASE: 'phase-production-server' })).toBe(false);
});
