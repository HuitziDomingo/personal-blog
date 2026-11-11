/**
 * Colores de los avisos de los comentarios, en claro y oscuro. El texto de los
 * avisos usa `fg`, así que el contraste del texto no depende de estos fondos;
 * los íconos cumplen 3:1 (WCAG 1.4.11) sobre su fondo. Lo comprueba
 * tones.test.ts.
 */
export const toneValues = {
  notice: { light: { bg: '#e3e6dc', border: '#a9c3bd', icon: '#1d6b68' }, dark: { bg: '#24302f', border: '#3c5554', icon: '#88ccca' } },
  info: { light: { bg: '#f8f3ec', border: '#d8ccbc', icon: '#1d6b68' }, dark: { bg: '#2a2a2f', border: '#3a3a40', icon: '#88ccca' } },
  danger: { light: { bg: '#f6e3e6', border: '#d9a3b0', icon: '#a3304d' }, dark: { bg: '#3a2a2f', border: '#6b3b47', icon: '#ff9db4' } },
  warning: { light: { bg: '#f5ecd2', border: '#d6c17a', icon: '#7a5a00' }, dark: { bg: '#2f2c22', border: '#6b5d2e', icon: '#f2cf6b' } },
} as const;

type ToneName = keyof typeof toneValues;

function modes<K extends 'bg' | 'border' | 'icon'>(name: ToneName, key: K) {
  return { _light: toneValues[name].light[key], _dark: toneValues[name].dark[key] };
}

export const tone = Object.fromEntries(
  (Object.keys(toneValues) as ToneName[]).map((name) => [
    name,
    { bg: modes(name, 'bg'), border: modes(name, 'border'), icon: modes(name, 'icon') },
  ]),
) as Record<ToneName, { bg: { _light: string; _dark: string }; border: { _light: string; _dark: string }; icon: { _light: string; _dark: string } }>;
