import type { NextConfig } from 'next';

import { securityHeaders } from './lib/security-headers';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // packages/markdown se publica como TypeScript sin compilar.
  transpilePackages: ['@personal-blog/markdown'],
  // jsdom (DOMPurify en el servidor) no se empaqueta: se carga de node_modules.
  serverExternalPackages: ['jsdom'],
  // Recomendado por Chakra v3: importa solo los componentes que se usan.
  experimental: { optimizePackageImports: ['@chakra-ui/react'] },
  // Sin AGENTS.md generado por next dev dentro de apps/web.
  agentRules: false,
  // CSP y cabeceras de ADR-017, punto 4, en todas las rutas.
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders(isDev) }]),
};

export default nextConfig;
