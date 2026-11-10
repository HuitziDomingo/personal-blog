import { expect, test } from '@playwright/test';

import { login, Post, publicPost, publicSlugs, run } from './support';

// Lo que guarda el editor (Milkdown) para lo que se teclea abajo: Markdown con
// salto de línea final (ADR-018).
const FIRST = '# Hola\n\nPrimera versión.\n';
const SECOND = '# Hola\n\nSegunda versión, **editada**.\n';

// Flujo crítico de ADR-006: Auth → creación de post → publicación. Además se
// edita el borrador, se comprueba que el contenido vuelve sin pérdidas, se
// comprueba en la API pública y se archiva.
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
    // El editor es WYSIWYG: se teclea como un usuario, y «# » se vuelve título.
    await page.getByLabel('Contenido').click();
    await page.keyboard.type('# Hola');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Primera versión.');
    const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.ok());
    await page.getByRole('button', { name: 'Guardar borrador' }).click();

    expect(((await (await created).json()) as Post).content).toBe(FIRST);
    await expect(status).toHaveText('Borrador guardado.');
    await expect(page).toHaveURL(/\/posts\/(?!new)[^/]+$/);
  });

  await test.step('un borrador no está en la API pública', async () => {
    expect((await publicPost(request, slug)).status()).toBe(404);
  });

  await test.step('edita el borrador', async () => {
    const content = page.getByLabel('Contenido');
    await content.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('# Hola');
    await page.keyboard.press('Enter');
    // «**editada**» se vuelve negritas al cerrar los asteriscos.
    await page.keyboard.type('Segunda versión, **editada**.');
    await expect(content.locator('strong')).toHaveText('editada');
    // La vista previa refleja el cambio.
    await expect(page.getByRole('region', { name: 'Vista previa' }).locator('strong')).toHaveText('editada');
    // El aviso «Borrador guardado.» ya está en pantalla desde el primer
    // guardado: se espera la respuesta del PUT, no solo el texto.
    const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.ok());
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    const draft = (await (await saved).json()) as Post;

    expect(draft.status).toBe('draft');
    expect(draft.content).toBe(SECOND);
    await expect(status).toHaveText('Borrador guardado.');
  });

  await test.step('el contenido vuelve de la API sin pérdidas', async () => {
    // Recarga: el editor se llena con lo que devuelve la API.
    const loaded = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().startsWith(`${run.apiUrl}/api/v1/admin/posts/`),
    );
    await page.reload();
    expect(((await (await loaded).json()) as Post).content).toBe(SECOND);

    const content = page.getByLabel('Contenido');
    await expect(content.locator('h1')).toHaveText('Hola');
    await expect(content.locator('strong')).toHaveText('editada');

    // Guardar sin tocar nada manda exactamente lo mismo.
    const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.ok());
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    expect(((await saved).request().postDataJSON() as Post).content).toBe(SECOND);
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
