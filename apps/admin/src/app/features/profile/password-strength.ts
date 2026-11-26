/** Mínimo de caracteres de una contraseña nueva (ADR-032). */
export const MIN_PASSWORD_LENGTH = 14;
/** Máximo de bytes en UTF-8: bcrypt no admite más (ADR-032). */
export const MAX_PASSWORD_BYTES = 72;

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  level: StrengthLevel;
  label: string;
}

export const STRENGTH_LABELS: Readonly<Record<StrengthLevel, string>> = {
  0: 'Muy débil',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Fuerte',
  4: 'Muy fuerte',
};

// Palabras y secuencias que un atacante prueba primero. En minúsculas.
const COMMON = ['password', 'contrasena', 'contraseña', 'qwerty', 'admin', 'huitzi', 'letmein', '123456', 'abcdef'];

/**
 * Estimación de la fuerza para orientar, no una regla: la API solo exige el
 * largo (ADR-032). Cuenta caracteres, no bytes, como el mínimo. Premia el
 * largo y la variedad, y castiga lo repetido y lo común.
 */
export function passwordStrength(password: string): PasswordStrength {
  const chars = [...password];
  if (chars.length < MIN_PASSWORD_LENGTH) {
    return strength(0);
  }

  let level = chars.length >= 24 ? 3 : chars.length >= 18 ? 2 : 1;
  if (characterClasses(password) >= 3) {
    level += 1;
  }

  if (isPredictable(password, chars)) {
    level = Math.min(level, 1);
  }

  return strength(Math.min(level, 4) as StrengthLevel);
}

/** Bytes en UTF-8: lo que cuenta bcrypt. */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function strength(level: StrengthLevel): PasswordStrength {
  return { level, label: STRENGTH_LABELS[level] };
}

function characterClasses(password: string): number {
  return [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((pattern) => pattern.test(password)).length;
}

// Pocos caracteres distintos («aaaaaaaa…», «abababab…») o una palabra común.
function isPredictable(password: string, chars: string[]): boolean {
  const lower = password.toLowerCase();

  return new Set(chars).size < chars.length / 3 || COMMON.some((word) => lower.includes(word));
}
