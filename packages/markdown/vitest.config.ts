import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Las specs de la variante de navegador usan jsdom como DOM global; la de
    // servidor declara el entorno node para probar que no depende de window.
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://huitzi.xyz/' } },
  },
});
