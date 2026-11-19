import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';

import { FakeMatchMedia, FakeStorage } from '../browser/browser-fakes';
import { MATCH_MEDIA } from '../browser/match-media';
import { BACKGROUND_INFO, BACKGROUND_STORAGE_KEY, BACKGROUNDS } from '../theme/backgrounds';
import { THEME_STORAGE } from '../theme/theme-storage';
import { ThemeService } from '../theme/theme.service';
import { BackgroundPicker } from './background-picker';

@Component({
  imports: [BackgroundPicker],
  template: `
    <span id="titulo">Fondo de pantalla</span>
    <p id="credito">Crédito</p>
    <app-background-picker labelledby="titulo" describedby="credito" />
    <button type="button">Después</button>
  `,
})
class Host {}

async function renderPicker(stored: Record<string, string> = {}) {
  const storage = new FakeStorage(stored);
  await render(Host, {
    providers: [
      { provide: THEME_STORAGE, useValue: storage },
      { provide: MATCH_MEDIA, useValue: new FakeMatchMedia().fn },
    ],
  });

  return { storage, theme: TestBed.inject(ThemeService), group: screen.getByRole('radiogroup', { name: 'Fondo de pantalla' }) };
}

const label = (index: number) => BACKGROUND_INFO[BACKGROUNDS[index]].label;
const radio = (index: number) => screen.getByRole('radio', { name: label(index) });

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('BackgroundPicker', () => {
  it('es un radiogroup con nombre y descripción, y una opción por fondo con su nombre', async () => {
    const { group } = await renderPicker();

    expect(group.getAttribute('aria-describedby')).toBe('credito');
    expect(within(group).getAllByRole('radio').map((option) => option.getAttribute('aria-label'))).toEqual(
      BACKGROUNDS.map((id) => BACKGROUND_INFO[id].label),
    );
  });

  it('marca la elegida con aria-checked, borde y palomita, y solo ella entra con Tab', async () => {
    await renderPicker({ [BACKGROUND_STORAGE_KEY]: BACKGROUNDS[2] });

    const options = screen.getAllByRole('radio');
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(options.map((_, index) => String(index === 2)));
    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(options.map((_, index) => (index === 2 ? '0' : '-1')));
    expect(options[2].classList).toContain('border-primary');
    expect(options[2].querySelector('ng-icon[name="lucideCheck"]')).not.toBeNull();
    expect(options[0].querySelector('ng-icon')).toBeNull();
  });

  it('las miniaturas son webp con carga diferida y siguen al tema', async () => {
    const { theme } = await renderPicker();
    const image = () => radio(0).querySelector('img')!;

    expect(image().getAttribute('loading')).toBe('lazy');
    expect(image().getAttribute('alt')).toBe('');
    expect(image().getAttribute('src')).toBe(`backgrounds/${BACKGROUNDS[0]}-light-thumb.webp`);

    theme.setMode('dark');
    TestBed.tick();

    expect(image().getAttribute('src')).toBe(`backgrounds/${BACKGROUNDS[0]}-dark-thumb.webp`);
  });

  it('con un clic elige el fondo y lo guarda', async () => {
    const { storage } = await renderPicker();

    fireEvent.click(radio(1));

    expect(radio(1).getAttribute('aria-checked')).toBe('true');
    expect(radio(0).getAttribute('aria-checked')).toBe('false');
    expect(storage.getItem(BACKGROUND_STORAGE_KEY)).toBe(BACKGROUNDS[1]);
  });

  it('las flechas mueven el foco con vuelta al principio y al final, sin elegir', async () => {
    const { storage } = await renderPicker();
    const last = BACKGROUNDS.length - 1;
    radio(0).focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radio(1));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(radio(2));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(radio(0));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(radio(last));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radio(0));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(radio(last));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(radio(0));

    expect(radio(0).getAttribute('aria-checked')).toBe('true');
    expect(storage.getItem(BACKGROUND_STORAGE_KEY)).toBeNull();
  });

  it('el tab stop sigue al foco y vuelve a la elegida al salir del grupo', async () => {
    await renderPicker();
    radio(0).focus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    TestBed.tick();
    expect(radio(1).getAttribute('tabindex')).toBe('0');
    expect(radio(0).getAttribute('tabindex')).toBe('-1');

    const after = screen.getByRole('button', { name: 'Después' });
    fireEvent.focusOut(radio(1), { relatedTarget: after });
    TestBed.tick();

    expect(radio(0).getAttribute('tabindex')).toBe('0');
    expect(radio(1).getAttribute('tabindex')).toBe('-1');
  });

  it('Espacio y Enter eligen la opción con foco (son botones: el navegador los convierte en clic)', async () => {
    await renderPicker();
    radio(0).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    expect(radio(1).tagName).toBe('BUTTON');
    expect(radio(1).getAttribute('type')).toBe('button');
    // jsdom no sintetiza el clic de Espacio/Enter; lo hace el navegador.
    fireEvent.click(document.activeElement!);

    expect(radio(1).getAttribute('aria-checked')).toBe('true');
  });

  it('las otras teclas no se interceptan', async () => {
    await renderPicker();
    radio(0).focus();

    expect(fireEvent.keyDown(radio(0), { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(radio(0), { key: 'ArrowRight' })).toBe(false);
  });
});
