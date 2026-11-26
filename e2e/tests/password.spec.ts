import { expect, test } from '@playwright/test';

import { login, run } from './support';

// Cambia la contraseña del admin de prueba y la devuelve a la original al
// terminar: los demás tests inician sesión con run.password.
test('cambiar la contraseña cierra las otras sesiones y deja abierta la actual (ADR-032)', async ({
  page,
  browser,
  playwright,
}) => {
  const newPassword = `${run.password}-nueva-2026`;
  const adminOrigin = new URL(test.info().project.use.baseURL ?? '').origin;

  // Otro dispositivo con su propia sesión.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  const otherRefresh = (await other.cookies(`${run.apiUrl}/api/v1/auth`)).find((c) => c.name === 'refresh_token');
  expect(otherRefresh?.value).toBeTruthy();

  let changed = false;
  try {
    await login(page);
    await page.getByRole('complementary', { name: 'Menú' }).getByRole('link', { name: 'Cambiar contraseña' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible();

    const current = page.getByLabel('Contraseña actual');
    const next = page.getByLabel('Contraseña nueva', { exact: true });
    const confirm = page.getByLabel('Repite la contraseña nueva');
    const submit = page.getByRole('button', { name: 'Cambiar contraseña' });

    // La actual incorrecta: 400, la sesión sigue.
    await current.fill(`${run.password}-incorrecta`);
    await next.fill(newPassword);
    await expect(page.getByText(/^Fuerza: /)).toBeVisible();
    await confirm.fill(newPassword);
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('La contraseña actual no es correcta.');
    await expect(page).toHaveURL(/\/profile$/);

    await current.fill(run.password);
    await submit.click();
    await expect(page.getByRole('status')).toContainText('Contraseña cambiada.');
    changed = true;
    await expect(current).toHaveValue('');

    // Este navegador sigue dentro, con cookies nuevas.
    expect((await page.request.get(`${run.apiUrl}/api/v1/auth/me`)).status()).toBe(200);
    await page.goto('/posts');
    await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();

    // El refresh token del otro dispositivo quedó revocado.
    const attacker = await playwright.request.newContext({
      extraHTTPHeaders: { Cookie: `refresh_token=${otherRefresh?.value}`, Origin: adminOrigin },
    });
    try {
      // Que la contraseña anterior ya no entra lo prueban los tests de Go: aquí
      // un login más agotaría el límite por IP que comparte toda la suite.
      expect((await attacker.post(`${run.apiUrl}/api/v1/auth/refresh`)).status()).toBe(401);
    } finally {
      await attacker.dispose();
    }
  } finally {
    await other.close();

    if (changed) {
      const restored = await page.request.post(`${run.apiUrl}/api/v1/auth/password`, {
        headers: { Origin: adminOrigin },
        data: { currentPassword: newPassword, newPassword: run.password },
      });
      expect(restored.status(), 'restore the original password').toBe(204);
    }
  }
});
