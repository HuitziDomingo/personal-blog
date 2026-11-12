import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, securityHeaders } from './security-headers';

describe('CSP de ADR-017, punto 4', () => {
  it('producción', () => {
    expect(contentSecurityPolicy(false)).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
    );
  });

  it("desarrollo: 'unsafe-eval' para React Refresh y sin upgrade-insecure-requests", () => {
    const csp = contentSecurityPolicy(true);

    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it("'unsafe-eval' nunca en producción", () => {
    expect(contentSecurityPolicy(false)).not.toContain('unsafe-eval');
  });

  it('sin comentarios no hay connect-src: cae en default-src', () => {
    expect(contentSecurityPolicy(false)).not.toContain('connect-src');
  });

  it('con comentarios, connect-src agrega solo la API (ADR-022, punto 8)', () => {
    const csp = contentSecurityPolicy(false, 'https://api.huitzi.xyz');

    expect(csp).toContain("connect-src 'self' https://api.huitzi.xyz;");
    // Lo demás no cambia.
    expect(csp.replace(" connect-src 'self' https://api.huitzi.xyz;", '')).toBe(contentSecurityPolicy(false));
  });
});

it('cabeceras', () => {
  expect(Object.fromEntries(securityHeaders(false).map(({ key, value }) => [key, value]))).toMatchObject({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
});
