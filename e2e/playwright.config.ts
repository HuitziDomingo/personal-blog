import { defineConfig, devices } from '@playwright/test';

// La corrida la arma scripts/run.mjs (make e2e): base temporal, API y admin en
// puertos libres, y un admin de prueba con credenciales generadas. Este archivo
// solo configura Playwright; las URLs llegan por variables de entorno.
export default defineConfig({
  testDir: './tests',
  // Un solo worker: los tests comparten el admin de prueba y los rate limits
  // de la API.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: process.env['E2E_ADMIN_URL'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // ADR-003 con ADR-013: solo Chromium.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
