// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Recomendado por Chakra v3: importa solo los componentes que se usan.
  experimental: { optimizePackageImports: ['@chakra-ui/react'] },
  // jsdom (para DOMPurify en el servidor) no se empaqueta: se carga de node_modules.
  serverExternalPackages: ['jsdom'],
};

export default nextConfig;
