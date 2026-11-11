import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';

import { FakeMatchMedia, FakeStorage } from '../browser/browser-fakes';
import { MATCH_MEDIA } from '../browser/match-media';
import { FakeSession } from '../session/session-fakes';
import { SessionService } from '../session/session.service';
import { THEME_STORAGE } from '../theme/theme-storage';
import { ThemeService } from '../theme/theme.service';
import { AdminNav } from './admin-nav';

@Component({ template: '' })
class EmptyPage {}

async function renderNav(url = '/posts', { canLeaveEditor = true } = {}) {
  const session = new FakeSession();
  const storage = new FakeStorage();
  const result = await render(AdminNav, {
    providers: [
      provideRouter([
        { path: 'posts', component: EmptyPage },
        { path: 'posts/:id', component: EmptyPage, canDeactivate: [() => canLeaveEditor] },
      ]),
      { provide: MATCH_MEDIA, useValue: new FakeMatchMedia().fn },
      { provide: THEME_STORAGE, useValue: storage },
      { provide: SessionService, useValue: session },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  result.fixture.detectChanges();

  return { ...result, session, storage, theme: TestBed.inject(ThemeService) };
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-accent');
});

describe('AdminNav', () => {
  it('enlaza a Posts y a Nuevo post', async () => {
    await renderNav();

    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('href')).toBe('/posts');
    expect(screen.getByRole('link', { name: 'Nuevo post' }).getAttribute('href')).toBe('/posts/new');
  });

  it('marca la página actual con aria-current, aunque la URL tenga query', async () => {
    await renderNav('/posts?status=draft');

    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Nuevo post' }).getAttribute('aria-current')).toBeNull();
  });

  it('en el editor de un post nuevo marca «Nuevo post» y no «Posts»', async () => {
    await renderNav('/posts/new');

    expect(screen.getByRole('link', { name: 'Nuevo post' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('aria-current')).toBeNull();
  });

  it('muestra el email del usuario y cierra la sesión', async () => {
    const { session } = await renderNav();

    expect(screen.getByText('leon@huitzi.xyz')).toBeTruthy();
    const logout = screen.getByRole('button', { name: 'Cerrar sesión' });
    await fireEvent.click(logout);

    await waitFor(() => expect(session.logoutCalls).toBe(1));
    expect((logout as HTMLButtonElement).disabled).toBe(true);
  });

  it('desde el editor sale primero y después cierra la sesión', async () => {
    const { session } = await renderNav('/posts/abc');

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(session.logoutCalls).toBe(1));
    expect(TestBed.inject(Router).url).toBe('/posts');
  });

  it('si el editor no deja salir (cambios sin guardar), no cierra la sesión', async () => {
    const { session, fixture } = await renderNav('/posts/abc', { canLeaveEditor: false });
    const logout = screen.getByRole('button', { name: 'Cerrar sesión' }) as HTMLButtonElement;

    await fireEvent.click(logout);
    await waitFor(() => expect(logout.disabled).toBe(false));
    fixture.detectChanges();

    expect(session.logoutCalls).toBe(0);
    expect(TestBed.inject(Router).url).toBe('/posts/abc');
  });

  it('ofrece el tema como un grupo de radios con nombre', async () => {
    await renderNav();

    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    const options = ['Claro', 'Oscuro', 'Sistema'].map((name) => screen.getByRole('radio', { name }));

    expect(options.every((option) => group.contains(option))).toBe(true);
    expect((screen.getByRole('radio', { name: 'Sistema' }) as HTMLInputElement).checked).toBe(true);
  });

  it('cada tema lleva su ícono, oculto al lector de pantalla', async () => {
    await renderNav();

    for (const [name, svg] of [
      ['Claro', lucideSun],
      ['Oscuro', lucideMoon],
      ['Sistema', lucideMonitor],
    ]) {
      const icon = screen.getByRole('radio', { name }).closest('label')?.querySelector('ng-icon');
      expect(icon?.getAttribute('aria-hidden'), name).toBe('true');
      // El contenido del <svg> de Lucide identifica el ícono.
      expect(icon?.innerHTML, name).toContain(svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')));
    }
  });

  it('cambia y guarda el tema', async () => {
    const { theme, storage } = await renderNav();

    await fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    TestBed.tick();

    expect(theme.mode()).toBe('dark');
    expect(storage.peek('admin-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ofrece seis colores de acento y cambia el elegido', async () => {
    const { theme } = await renderNav();

    const group = screen.getByRole('radiogroup', { name: 'Color de acento' });
    expect(group.querySelectorAll('input[type="radio"]').length).toBe(6);

    await fireEvent.click(screen.getByRole('radio', { name: 'Verde' }));
    TestBed.tick();

    expect(theme.accent()).toBe('green');
    expect(document.documentElement.getAttribute('data-accent')).toBe('green');
  });
});
