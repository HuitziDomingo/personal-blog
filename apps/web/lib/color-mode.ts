/** Preferencia guardada en localStorage: `light`, `dark` o ausente (sistema). */
export const COLOR_MODE_KEY = 'color-mode';

export type ColorModePreference = 'light' | 'dark' | 'system';

/**
 * Se ejecuta en <head> antes de pintar: aplica la clase `light` o `dark` a
 * <html> según la preferencia guardada o la del sistema, y así no hay un
 * destello del otro modo. Es un script inline: la CSP de ADR-017 lo permite
 * (`script-src 'self' 'unsafe-inline'`) sin nonces, así que el ISR sigue.
 */
export const colorModeScript = `(function(){try{var k=${JSON.stringify(COLOR_MODE_KEY)};var p=localStorage.getItem(k);var m=p==='light'||p==='dark'?p:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(m);d.style.colorScheme=m;}catch(e){}})();`;

export function readPreference(storage: Pick<Storage, 'getItem'>): ColorModePreference {
  try {
    const value = storage.getItem(COLOR_MODE_KEY);

    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveMode(preference: ColorModePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}
