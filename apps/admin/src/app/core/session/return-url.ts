// eslint-disable-next-line no-control-regex -- buscarlos es justo el objetivo.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Devuelve `value` solo si es una ruta interna del admin; si no, `/`. Evita
 * que un `?returnUrl=//evil.test` o `https://evil.test` saque al usuario del
 * admin después del login. También rechaza caracteres de control: el
 * navegador quita tabs y saltos de línea al parsear, así que `/\t/evil.test`
 * acabaría siendo `//evil.test`.
 */
export function safeReturnUrl(value: string | null | undefined): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\') ||
    CONTROL_CHARS.test(value)
  ) {
    return '/';
  }

  return value;
}
