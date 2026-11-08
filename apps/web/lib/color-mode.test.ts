import { describe, expect, it } from 'vitest';

import { COLOR_MODE_KEY, colorModeScript, readPreference, resolveMode } from './color-mode';

function storage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key) => (key === COLOR_MODE_KEY ? value : null) };
}

describe('readPreference', () => {
  it('returns a saved light or dark preference', () => {
    expect(readPreference(storage('light'))).toBe('light');
    expect(readPreference(storage('dark'))).toBe('dark');
  });

  it('falls back to system for missing or unknown values', () => {
    expect(readPreference(storage(null))).toBe('system');
    expect(readPreference(storage('sepia'))).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    expect(
      readPreference({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
  });
});

describe('resolveMode', () => {
  it('follows the system only when the preference is system', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});

describe('colorModeScript', () => {
  it('reads the same storage key as the toggle', () => {
    expect(colorModeScript).toContain(JSON.stringify(COLOR_MODE_KEY));
  });

  it('is valid JavaScript', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- solo se compila, no se ejecuta
    expect(() => new Function(colorModeScript)).not.toThrow();
  });
});
