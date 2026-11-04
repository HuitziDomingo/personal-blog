import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('acepta rutas internas', () => {
    expect(safeReturnUrl('/')).toBe('/');
    expect(safeReturnUrl('/posts?page=2')).toBe('/posts?page=2');
  });

  it('rechaza URLs que salen del admin', () => {
    for (const value of ['//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', 'posts']) {
      expect(safeReturnUrl(value)).toBe('/');
    }
  });

  it('rechaza valores con caracteres de control, que el navegador elimina al parsear', () => {
    for (const value of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/\u0000/evil.test', '/posts\u001F']) {
      expect(safeReturnUrl(value)).toBe('/');
    }
  });

  it('sin valor vuelve al dashboard', () => {
    expect(safeReturnUrl(undefined)).toBe('/');
    expect(safeReturnUrl(null)).toBe('/');
  });
});
