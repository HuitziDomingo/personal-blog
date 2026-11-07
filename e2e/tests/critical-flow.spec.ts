import { expect, test } from '@playwright/test';

import { login, Post, publicPost, publicSlugs } from './support';

// Flujo crítico de ADR-006: Auth → creación de post → publicación. Además se
// edita el borrador, se comprueba en la API pública y se archiva.
test('login, borrador, edición, publicación, API pública y archivo', async ({ page, request }) => {
  const slug = `e2e-${Date.now()}`;
  const title = `Post de prueba ${slug}`;
  const status = page.getByRole('status');

  await test.step('inicia sesión', async () => {
    await login(page);
  });

  await test.step('crea un borrador', async () => {
    await page.getByRole('main').getByRole('link', { name: 'Nuevo post' }).click();
    await expect(page).toHaveURL(/\/posts\/new$/);

    await page.getByLabel('Título', { exact: true }).fill(title);
    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Contenido').fill('# Hola\n\nPrimera versión.');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();

    await expect(status).toHaveText('Borrador guardado.');
    await expect(page).toHaveURL(/\/posts\/(?!new)[^/]+$/);
  });

  await test.step('un borrador no está en la API pública', async () => {
    expect((await publicPost(request, slug)).status()).toBe(404);
  });

  await test.step('edita el borrador', async () => {
    const content = page.getByLabel('Contenido');
    await content.fill('# Hola\n\nSegunda versión, **editada**.');
    // La vista previa refleja el cambio.
    await expect(page.getByRole('region', { name: 'Vista previa' }).locator('strong')).toHaveText('editada');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();

    await expect(status).toHaveText('Borrador guardado.');
  });

  await test.step('publica', async () => {
    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(status).toHaveText('Post publicado.');
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  });

  await test.step('el post publicado está en la API pública, con la edición', async () => {
    const response = await publicPost(request, slug);
    expect(response.status()).toBe(200);
    const post = (await response.json()) as Post;
    expect(post.title).toBe(title);
    expect(post.status).toBe('published');
    expect(post.content).toContain('Segunda versión, **editada**.');
    expect(await publicSlugs(request)).toContain(slug);
  });

  await test.step('archiva', async () => {
    await page.getByRole('main').getByRole('button', { name: 'Archivar' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('¿Archivar este post?');
    await dialog.getByRole('button', { name: 'Archivar' }).click();

    await expect(page).toHaveURL(/\/posts\?status=archived$/);
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });

  await test.step('un post archivado ya no está en la API pública', async () => {
    expect((await publicPost(request, slug)).status()).toBe(404);
    expect(await publicSlugs(request)).not.toContain(slug);
  });
});
