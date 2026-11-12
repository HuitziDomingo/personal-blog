/**
 * CSP y cabeceras de ADR-017, punto 4. Sin nonces, para no perder el ISR.
 * En desarrollo, Next necesita `'unsafe-eval'` (React Refresh) y sirve por
 * http, así que no se pide `upgrade-insecure-requests`.
 */
export function contentSecurityPolicy(isDev: boolean, apiOrigin: string | null = null): string {
  return [
    "default-src 'self'",
    // Solo con comentarios: el formulario los envía directo a la API (ADR-022,
    // punto 8). Sin ellos, connect-src cae en default-src.
    ...(apiOrigin ? [`connect-src 'self' ${apiOrigin}`] : []),
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function securityHeaders(isDev: boolean, apiOrigin: string | null = null): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(isDev, apiOrigin) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
}
