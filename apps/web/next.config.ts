import path from 'node:path';

import type { NextConfig } from 'next';

import { commentsApiOrigin } from './lib/config';
import { securityHeaders } from './lib/security-headers';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Raíz del monorepo, fija: sin esto, Next la infiere buscando lockfiles hacia
  // arriba y puede elegir uno fuera del repo (por ejemplo, en el home).
  turbopack: { root: path.join(__dirname, '..', '..') },
  poweredByHeader: false,
  // packages/markdown se publica como TypeScript sin compilar.
  transpilePackages: ['@personal-blog/markdown'],
  // jsdom (DOMPurify en el servidor) no se empaqueta: se carga de node_modules.
  serverExternalPackages: ['jsdom'],
  // optimizePackageImports, recomendado por Chakra v3: importa solo los
  // componentes que se usan. globalNotFound: el 404 de app/global-not-found.tsx,
  // necesario con un layout raíz por idioma (ADR-024, punto 2).
  experimental: { optimizePackageImports: ['@chakra-ui/react'], globalNotFound: true },
  // Sin AGENTS.md generado por next dev dentro de apps/web.
  agentRules: false,
  // AVIF primero y WebP de respaldo para next/image.
  images: { formats: ['image/avif', 'image/webp'] },
  // /posts era la sección de artículos de la web anterior; el blog vive en /blog.
  redirects: () =>
    Promise.resolve([
      { source: '/posts', destination: '/blog', permanent: true },
      { source: '/posts/:slug', destination: '/blog/:slug', permanent: true },
    ]),
  // CSP y cabeceras de ADR-017, punto 4, en todas las rutas.
  // Con comentarios, connect-src agrega la API (ADR-022, punto 8).
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders(isDev, commentsApiOrigin()) }]),
};

export default nextConfig;
