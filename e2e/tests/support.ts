import { APIRequestContext, expect, Page } from '@playwright/test';

import type { components } from '@personal-blog/api-types';

export type Post = components['schemas']['Post'];
export type PostPage = components['schemas']['PostPage'];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name}: corre los E2E con make e2e`);
  }

  return value;
}

/** Datos de la corrida, que genera scripts/run.mjs. */
export const run = {
  apiUrl: required('E2E_API_URL'),
  email: required('E2E_ADMIN_EMAIL'),
  password: required('E2E_ADMIN_PASSWORD'),
};

/** Inicia sesión con el admin de prueba y espera la lista de posts. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(run.email);
  await page.getByLabel('Contraseña').fill(run.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();
}

/** GET a la API pública de posts, sin cookies: lo que ve un visitante. */
export async function publicPost(request: APIRequestContext, slug: string) {
  return request.get(`${run.apiUrl}/api/v1/posts/${slug}`);
}

export async function publicSlugs(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(`${run.apiUrl}/api/v1/posts?limit=100`);
  expect(response.status()).toBe(200);
  const page = (await response.json()) as PostPage;

  return page.items.map((post) => post.slug);
}
