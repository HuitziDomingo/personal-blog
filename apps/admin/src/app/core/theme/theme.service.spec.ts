import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, FakeStorage } from '../browser/browser-fakes';
import { MATCH_MEDIA } from '../browser/match-media';
import { localStorageOf, THEME_STORAGE } from './theme-storage';
import { ThemeService } from './theme.service';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function setup({ stored = {}, systemDark = false, failing = false } = {}) {
  const storage = new FakeStorage(stored);
  storage.failing = failing;
  const media = new FakeMatchMedia({ [DARK_QUERY]: systemDark });

  TestBed.configureTestingModule({
    providers: [
      { provide: THEME_STORAGE, useValue: storage },
      { provide: MATCH_MEDIA, useValue: media.fn },
    ],
  });

  const theme = TestBed.inject(ThemeService);
  const root = TestBed.inject(DOCUMENT).documentElement;
  // Los effects corren en el siguiente ciclo de detección de cambios.
  TestBed.tick();

  return { theme, root, storage, system: media.list(DARK_QUERY) };
}

afterEach(() => {
  const root = document.documentElement;
  root.classList.remove('dark');
  root.removeAttribute('data-accent');
});

describe('ThemeService', () => {
  it('sin preferencia guardada usa el sistema y el acento neutro', () => {
    const { theme, root } = setup({ systemDark: true });

    expect(theme.mode()).toBe('system');
    expect(theme.accent()).toBe('neutral');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.getAttribute('data-accent')).toBe('neutral');
  });

  it('restaura el modo y el acento guardados', () => {
    const { theme, root } = setup({ stored: { 'admin-theme': 'dark', 'admin-accent': 'violet' } });

    expect(theme.mode()).toBe('dark');
    expect(theme.accent()).toBe('violet');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.getAttribute('data-accent')).toBe('violet');
  });

  it('ignora valores guardados que no son válidos', () => {
    const { theme } = setup({ stored: { 'admin-theme': 'sepia', 'admin-accent': '"><script>' } });

    expect(theme.mode()).toBe('system');
    expect(theme.accent()).toBe('neutral');
  });

  it('guarda y aplica el modo y el acento elegidos', () => {
    const { theme, root, storage } = setup({ systemDark: true });

    theme.setMode('light');
    theme.setAccent('green');
    TestBed.tick();

    expect(root.classList.contains('dark')).toBe(false);
    expect(root.getAttribute('data-accent')).toBe('green');
    expect(storage.peek('admin-theme')).toBe('light');
    expect(storage.peek('admin-accent')).toBe('green');
  });

  it('en "Sistema" cambia en vivo cuando cambia el sistema operativo', () => {
    const { theme, root, system } = setup({ systemDark: false });

    system.set(true);
    TestBed.tick();
    expect(theme.isDark()).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);

    system.set(false);
    TestBed.tick();
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('con un modo fijo ignora los cambios del sistema', () => {
    const { theme, root, system } = setup({ systemDark: false });

    theme.setMode('light');
    system.set(true);
    TestBed.tick();

    expect(root.classList.contains('dark')).toBe(false);
  });

  it('si localStorage falla al leer, arranca con el tema del sistema', () => {
    const { theme, root } = setup({ stored: { 'admin-theme': 'light' }, systemDark: true, failing: true });

    expect(theme.mode()).toBe('system');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('si localStorage falla al guardar, la preferencia vale para la sesión', () => {
    const { theme, root, storage } = setup();
    storage.failing = true;

    expect(() => theme.setMode('dark')).not.toThrow();
    TestBed.tick();

    expect(theme.mode()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('sin localStorage ni matchMedia funciona en claro', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: THEME_STORAGE, useValue: null },
        { provide: MATCH_MEDIA, useValue: null },
      ],
    });
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();

    theme.setAccent('rose');
    expect(theme.isDark()).toBe(false);
    expect(theme.accent()).toBe('rose');
  });

  it('sigue los cambios hechos en otra pestaña, validados', () => {
    const { theme, root } = setup();

    window.dispatchEvent(new StorageEvent('storage', { key: 'admin-theme', newValue: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'admin-accent', newValue: 'amber' }));
    TestBed.tick();
    expect(theme.mode()).toBe('dark');
    expect(root.getAttribute('data-accent')).toBe('amber');

    window.dispatchEvent(new StorageEvent('storage', { key: 'admin-accent', newValue: 'x" onload="' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra', newValue: 'dark' }));
    TestBed.tick();
    expect(theme.accent()).toBe('neutral');
    expect(theme.mode()).toBe('dark');
  });

  it('quita el listener del sistema al destruirse', () => {
    const { system } = setup();
    expect(system.listenerCount).toBe(1);

    TestBed.resetTestingModule();

    expect(system.listenerCount).toBe(0);
  });
});

describe('localStorageOf', () => {
  it('devuelve null si leer localStorage lanza un error', () => {
    const view = {
      get localStorage(): Storage {
        throw new DOMException('bloqueado', 'SecurityError');
      },
    } as unknown as Window;

    expect(localStorageOf(view)).toBeNull();
    expect(localStorageOf(null)).toBeNull();
  });

  it('devuelve el localStorage de la ventana', () => {
    const storage = new FakeStorage();

    expect(localStorageOf({ localStorage: storage } as unknown as Window)).toBe(storage);
  });
});
