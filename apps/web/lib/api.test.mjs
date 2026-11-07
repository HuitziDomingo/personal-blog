// Validación del slug antes de llamar a la API. Corre con node --test.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPublishedPost, isValidSlug } from './api.js';

test('acepta los slugs del contrato', () => {
  assert.equal(isValidSlug('programacion-claude'), true);
  assert.equal(isValidSlug('a'), true);
  assert.equal(isValidSlug('a'.repeat(80)), true);
});

test('rechaza lo que podría cambiar la ruta o no cumple el contrato', () => {
  for (const slug of ['.', '..', '', 'a/b', '%2e', 'A', 'a--b', '-a', 'a-', 'a b', 'a'.repeat(81)]) {
    assert.equal(isValidSlug(slug), false, JSON.stringify(slug));
  }
});

test('un slug inválido no llega a la API', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('no debería llamarse');
  });

  assert.equal(await getPublishedPost('..'), null);
  assert.equal(await getPublishedPost('x'.repeat(300)), null);
  assert.equal(fetchMock.mock.callCount(), 0);
});
