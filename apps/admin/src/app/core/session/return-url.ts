/**
 * Devuelve `value` solo si es una ruta interna del admin; si no, `/`. Evita
 * que un `?returnUrl=//evil.test` o `https://evil.test` saque al usuario del
 * admin después del login.
 */
export function safeReturnUrl(value: string | null | undefined): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/';
  }

  return value;
}
