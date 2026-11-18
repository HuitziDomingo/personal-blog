import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, FakeStorage } from '../browser/browser-fakes';
import { MATCH_MEDIA } from '../browser/match-media';
import { BackgroundService, LOGIN_BACKGROUND_ATTRIBUTE, PICK_BACKGROUND } from './background.service';
import { BACKGROUNDS } from './backgrounds';
import { THEME_STORAGE } from './theme-storage';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function setup({ stored = {}, failing = false, systemDark = false, fromScript = null as string | null } = {}) {
  const storage = new FakeStorage(stored);
  storage.failing = failing;
  const media = new FakeMatchMedia({ [DARK_QUERY]: systemDark });
  const root = document.documentElement;
  if (fromScript) {
    root.setAttribute(LOGIN_BACKGROUND_ATTRIBUTE, fromScript);
  }
  const pick = vi.fn(() => 'map' as const);

  TestBed.configureTestingModule({
    providers: [
      { provide: THEME_STORAGE, useValue: storage },
      { provide: MATCH_MEDIA, useValue: media.fn },
      { provide: PICK_BACKGROUND, useValue: pick },
    ],
  });

  return { backgrounds: TestBed.inject(BackgroundService), storage, pick, system: media.list(DARK_QUERY) };
}

afterEach(() => {
  document.documentElement.removeAttribute(LOGIN_BACKGROUND_ATTRIBUTE);
  document.documentElement.classList.remove('dark');
});

describe('BackgroundService', () => {
  it('sin fondo guardado usa el de por defecto', () => {
    expect(setup().backgrounds.selected()).toBe('fold');
  });

  it('restaura el fondo guardado e ignora uno inválido', () => {
    expect(setup({ stored: { 'admin-background': 'map' } }).backgrounds.selected()).toBe('map');
    TestBed.resetTestingModule();
    expect(setup({ stored: { 'admin-background': 'javascript:x' } }).backgrounds.selected()).toBe('fold');
  });

  it('guarda el fondo elegido', () => {
    const { backgrounds, storage } = setup();
    backgrounds.setBackground('map');

    expect(backgrounds.selected()).toBe('map');
    expect(storage.getItem('admin-background')).toBe('map');
  });

  it('si localStorage falla, el fondo vale para la sesión', () => {
    const { backgrounds } = setup({ failing: true });

    expect(backgrounds.selected()).toBe('fold');
    expect(() => backgrounds.setBackground('map')).not.toThrow();
    expect(backgrounds.selected()).toBe('map');
  });

  it('la versión sigue al tema, también en modo sistema', () => {
    const { backgrounds, system } = setup();
    expect(backgrounds.variant()).toBe('light');

    system.set(true);
    TestBed.tick();
    expect(backgrounds.variant()).toBe('dark');
  });

  it('el login usa el fondo que eligió el script de index.html', () => {
    const { backgrounds, pick } = setup({ fromScript: 'fold' });

    expect(backgrounds.loginBackground).toBe('fold');
    expect(pick).not.toHaveBeenCalled();
  });

  it('si la carga no empezó en /login, el login elige uno al azar de la colección', () => {
    const { backgrounds, pick } = setup({ fromScript: 'no-existe' });

    expect(backgrounds.loginBackground).toBe('map');
    expect(pick).toHaveBeenCalledWith(BACKGROUNDS);
  });

  it('sigue los cambios de otras pestañas', () => {
    const { backgrounds } = setup();
    const view = TestBed.inject(DOCUMENT).defaultView!;

    view.dispatchEvent(new StorageEvent('storage', { key: 'admin-background', newValue: 'map' }));
    expect(backgrounds.selected()).toBe('map');
    view.dispatchEvent(new StorageEvent('storage', { key: 'admin-background', newValue: 'nope' }));
    expect(backgrounds.selected()).toBe('fold');
  });
});
