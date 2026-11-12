import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';

import { FakeMatchMedia, FakeStorage } from '../browser/browser-fakes';
import { MATCH_MEDIA } from '../browser/match-media';
import { CommentsApi } from '../api/comments-api';
import { FakeCommentsApi } from '../comments/comments-fakes';
import { FakeSession } from '../session/session-fakes';
import { SessionService } from '../session/session.service';
import { THEME_STORAGE } from '../theme/theme-storage';
import { AdminShell, DESKTOP_QUERY } from './admin-shell';

@Component({ template: '<h1>Página</h1>' })
class EmptyPage {}

async function renderShell({ desktop = false } = {}) {
  const media = new FakeMatchMedia({ [DESKTOP_QUERY]: desktop });
  const session = new FakeSession();
  const comments = new FakeCommentsApi();
  const result = await render(AdminShell, {
    providers: [
      provideRouter([
        { path: 'posts', component: EmptyPage },
        { path: 'posts/new', component: EmptyPage },
      ]),
      { provide: MATCH_MEDIA, useValue: media.fn },
      { provide: THEME_STORAGE, useValue: new FakeStorage() },
      { provide: SessionService, useValue: session },
      { provide: CommentsApi, useValue: comments },
    ],
  });

  return { ...result, session, desktop: media.list(DESKTOP_QUERY) };
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Abrir menú' });
  // Un clic real enfoca el botón; fireEvent no. El CDK devuelve el foco al
  // elemento que lo tenía al abrir.
  trigger.focus();
  await fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog');

  return { trigger, dialog };
}

describe('AdminShell', () => {
  it('en escritorio muestra la barra lateral y no el botón de menú', async () => {
    await renderShell({ desktop: true });

    expect(screen.getByRole('complementary', { name: 'Menú' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).toBeNull();
  });

  it('en móvil el menú está cerrado y el botón lo abre como offcanvas', async () => {
    await renderShell();

    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');

    const { dialog } = await openMenu();

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('nav[aria-label="Principal"]')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('el foco entra al offcanvas al abrirlo', async () => {
    await renderShell();
    const { dialog } = await openMenu();

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('el panel es modal y queda entre las anclas del FocusTrap del CDK', async () => {
    await renderShell();
    const { dialog } = await openMenu();

    // jsdom no tiene layout y el CDK no ve elementos enfocables, así que aquí
    // solo se comprueba que el trap está montado alrededor del panel. Que Tab
    // no sale del panel se prueba en Chrome (descripción del PR).
    const [start, end] = [...document.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor')];
    expect(start.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(end.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('Esc cierra el offcanvas y el foco vuelve al botón', async () => {
    await renderShell();
    const { trigger, dialog } = await openMenu();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await fireEvent.keyDown(document.activeElement as Element, { key: 'Escape', code: 'Escape', keyCode: 27 });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('el botón «Cerrar menú» cierra el offcanvas', async () => {
    await renderShell();
    await openMenu();

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('se cierra al navegar desde el menú', async () => {
    await renderShell();
    await openMenu();

    await fireEvent.click(screen.getByRole('link', { name: 'Nuevo post' }));

    await waitFor(() => expect(TestBed.inject(Router).url).toBe('/posts/new'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('se cierra al pasar a escritorio, donde el menú queda en la barra lateral', async () => {
    const { desktop, fixture } = await renderShell();
    await openMenu();

    desktop.set(true);
    fixture.detectChanges();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('complementary', { name: 'Menú' })).toBeTruthy();
    // El botón que abrió el menú ya no existe: el foco va al contenido.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
  });

  it('el enlace para saltar al contenido mueve el foco al main', async () => {
    await renderShell({ desktop: true });

    await fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido' }));

    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
