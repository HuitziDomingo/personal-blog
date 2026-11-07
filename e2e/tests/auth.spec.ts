import { expect, test } from '@playwright/test';

import { login, run } from './support';

test('con una contraseña incorrecta no entra y lo dice', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(run.email);
  await page.getByLabel('Contraseña').fill(`${run.password}-incorrecta`);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/login$/);
});

test('cerrar sesión vuelve al login, revoca el refresh token y protege las rutas', async ({ page, playwright }) => {
  await login(page);

  // Control: con sesión, /auth/me responde 200 (la cookie viaja a 127.0.0.1).
  expect((await page.request.get(`${run.apiUrl}/api/v1/auth/me`)).status()).toBe(200);
  const refreshToken = (await page.context().cookies(run.apiUrl + '/api/v1/auth')).find(
    (cookie) => cookie.name === 'refresh_token',
  );
  expect(refreshToken?.value).toBeTruthy();

  await page.getByRole('complementary', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // El navegador ya no tiene sesión.
  expect((await page.request.get(`${run.apiUrl}/api/v1/auth/me`)).status()).toBe(401);

  // Y el refresh token anterior quedó revocado en la API: reenviarlo a mano da
  // 401 (el contrato: logout revoca el token de refresco).
  const attacker = await playwright.request.newContext({
    extraHTTPHeaders: { Cookie: `refresh_token=${refreshToken?.value}`, Origin: new URL(page.url()).origin },
  });
  try {
    expect((await attacker.post(`${run.apiUrl}/api/v1/auth/refresh`)).status()).toBe(401);
  } finally {
    await attacker.dispose();
  }

  await page.goto('/posts');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fposts$/);
});
