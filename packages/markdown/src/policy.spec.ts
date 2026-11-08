// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isSafeUrl } from './policy.ts';

const base = 'https://huitzi.xyz/posts/hola';

describe('isSafeUrl', () => {
  it.each([
    ['https://otro.example/x', 'href'],
    ['http://otro.example/x', 'src'],
    ['mailto:hola@huitzi.xyz', 'href'],
    ['#seccion', 'href'],
    ['/posts/x', 'src'],
    ['otra', 'href'],
    // No es un caso especial: resuelve a la propia página, del mismo origen.
    ['#seccion', 'src'],
  ] as const)('acepta %s en %s', (value, attribute) => {
    expect(isSafeUrl(value, attribute, base)).toBe(true);
  });

  it.each([
    ['mailto:hola@huitzi.xyz', 'src'],
    ['javascript:alert(1)', 'href'],
    ['data:image/png;base64,AA==', 'src'],
    ['//evil.test', 'href'],
    ['/\\evil.test', 'src'],
    ['http://[::1', 'href'],
  ] as const)('rechaza %s en %s', (value, attribute) => {
    expect(isSafeUrl(value, attribute, base)).toBe(false);
  });

  it('las rutas relativas dependen del origen de la página', () => {
    expect(isSafeUrl('/posts/x', 'href', 'http://localhost:4200/editor')).toBe(true);
    expect(isSafeUrl('http://localhost:4200/x', 'href', 'https://huitzi.xyz')).toBe(true);
  });
});
