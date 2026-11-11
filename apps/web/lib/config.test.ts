import { describe, expect, it, vi } from 'vitest';

import { API_ANONYMOUS_BURST, apiBaseUrl, buildRequests, commentsApiOrigin, commentsEnabled, isBuildPhase, prerenderLimit, siteUrl } from './config';

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

describe('prerenderLimit (ADR-020)', () => {
  it('por defecto pregenera 10', () => {
    expect(prerenderLimit({})).toBe(10);
    expect(prerenderLimit({ WEB_PRERENDER_LIMIT: '' })).toBe(10);
  });

  it('se configura con WEB_PRERENDER_LIMIT', () => {
    expect(prerenderLimit({ WEB_PRERENDER_LIMIT: '5' })).toBe(5);
    expect(prerenderLimit({ WEB_PRERENDER_LIMIT: '0' })).toBe(0);
  });

  it.each(['-1', '2.5', 'diez', ' 3'])('rechaza %j en lugar de pregenerar de más o de menos', (value) => {
    expect(() => prerenderLimit({ WEB_PRERENDER_LIMIT: value })).toThrow('non-negative integer');
  });

  it('con el valor por defecto el build queda por debajo de la ráfaga anónima, sin aviso', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Lista de inicio + una página de slugs (hasta 100 publicados) + los posts.
    expect(1 + 1 + prerenderLimit({})).toBeLessThan(API_ANONYMOUS_BURST);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('avisa si N más las listas supera la ráfaga', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(prerenderLimit({ WEB_PRERENDER_LIMIT: '19' })).toBe(19);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('may get 429'));
    warn.mockRestore();
  });

  it('con comentarios, cada post pregenerado cuesta una petición más', () => {
    expect(buildRequests(10, {})).toBe(12);
    expect(buildRequests(10, { COMMENTS_ENABLED: 'true' })).toBe(22);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(prerenderLimit({ COMMENTS_ENABLED: 'true' })).toBe(10);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('may get 429'));
    warn.mockRestore();
  });
});

describe('commentsEnabled (ADR-022, punto 10)', () => {
  it('apagados por defecto', () => {
    expect(commentsEnabled({})).toBe(false);
    expect(commentsEnabled({ COMMENTS_ENABLED: 'false' })).toBe(false);
    expect(commentsEnabled({ COMMENTS_ENABLED: '1' })).toBe(false);
  });

  it('solo "true" los enciende', () => {
    expect(commentsEnabled({ COMMENTS_ENABLED: 'true' })).toBe(true);
  });
});

describe('commentsApiOrigin', () => {
  it('null con los comentarios apagados', () => {
    expect(commentsApiOrigin({ API_BASE_URL: 'https://api.huitzi.xyz', NODE_ENV: 'production' })).toBeNull();
  });

  it('el origen de la API, sin ruta, con los comentarios encendidos', () => {
    expect(commentsApiOrigin({ COMMENTS_ENABLED: 'true', API_BASE_URL: 'https://api.huitzi.xyz/', NODE_ENV: 'production' })).toBe(
      'https://api.huitzi.xyz',
    );
  });

  it('null si se construye sin API', () => {
    expect(commentsApiOrigin({ COMMENTS_ENABLED: 'true', WEB_SKIP_API: '1', NODE_ENV: 'production' })).toBeNull();
  });
});
