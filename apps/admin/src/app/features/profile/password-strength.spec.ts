import { passwordStrength, utf8Length } from './password-strength';

describe('passwordStrength', () => {
  it('menos de 14 caracteres es muy débil', () => {
    expect(passwordStrength('')).toEqual({ level: 0, label: 'Muy débil' });
    expect(passwordStrength('Ab1!Ab1!Ab1!x')).toEqual({ level: 0, label: 'Muy débil' });
  });

  it('cuenta caracteres, no unidades UTF-16: 14 emojis llegan al mínimo', () => {
    expect(passwordStrength('🦁'.repeat(13)).level).toBe(0);
    expect(passwordStrength('🦁🐯🐻🐼🐨🐸🐵🐔🐧🐦🐤🐺🐗🐴').level).toBeGreaterThan(0);
  });

  it('premia el largo', () => {
    expect(passwordStrength('cielo rojo de m').label).toBe('Débil');
    expect(passwordStrength('cielo rojo de marzo').label).toBe('Aceptable');
    expect(passwordStrength('cielo rojo de marzo en leon').label).toBe('Fuerte');
  });

  it('premia la variedad de caracteres', () => {
    expect(passwordStrength('Cielo rojo de marzo 7').label).toBe('Fuerte');
    expect(passwordStrength('Cielo rojo de marzo en León 7').label).toBe('Muy fuerte');
  });

  it('castiga lo repetido y las palabras comunes', () => {
    expect(passwordStrength('a'.repeat(30)).label).toBe('Débil');
    expect(passwordStrength('ababababababababababab').label).toBe('Débil');
    expect(passwordStrength('MiPassword2026!!largo').label).toBe('Débil');
    expect(passwordStrength('Qwerty-de-León-2026!').label).toBe('Débil');
  });
});

describe('utf8Length', () => {
  it('cuenta bytes', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('ñ')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('🦁')).toBe(4);
  });
});
