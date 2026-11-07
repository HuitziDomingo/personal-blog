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

test('cerrar sesión vuelve al login y protege las rutas', async ({ page }) => {
  await login(page);

  await page.getByRole('complementary', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // La cookie de sesión ya no vale: /auth/me responde 401.
  const me = await page.request.get(`${run.apiUrl}/api/v1/auth/me`);
  expect(me.status()).toBe(401);

  await page.goto('/posts');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fposts$/);
});
