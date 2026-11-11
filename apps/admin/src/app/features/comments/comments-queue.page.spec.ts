import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { throwError } from 'rxjs';

import { CommentsApi } from '../../core/api/comments-api';
import { aComment, FakeCommentsApi } from '../../core/comments/comments-fakes';
import { PendingComments } from '../../core/comments/pending-comments';
import { ApiError } from '../../core/http/api-error';
import { CommentsQueuePage } from './comments-queue.page';

async function renderQueue(api: FakeCommentsApi, inputs: { status?: string; offset?: string } = {}) {
  const result = await render(CommentsQueuePage, {
    inputs,
    providers: [
      provideRouter([{ path: 'comments', component: CommentsQueuePage }], withComponentInputBinding()),
      { provide: CommentsApi, useValue: api },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...result, api, navigate, pending: TestBed.inject(PendingComments) };
}

describe('CommentsQueuePage', () => {
  it('sin status muestra Pendientes', async () => {
    const api = new FakeCommentsApi();
    api.comments = [aComment({ id: 'a', name: 'Valeria' }), aComment({ id: 'b', name: 'Diego', status: 'approved' })];
    await renderQueue(api);

    expect(api.listCalls).toContainEqual({ status: 'pending', limit: 20, offset: 0 });
    expect(screen.getByRole('heading', { name: 'Valeria' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Diego' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Pendientes · 1' }).getAttribute('aria-current')).toBe('page');
  });

  it('la pestaña sale de la URL; un status inválido es Pendientes', async () => {
    const api = new FakeCommentsApi();
    await renderQueue(api, { status: 'rejected', offset: '20' });
    expect(api.listCalls.at(-1)).toEqual({ status: 'rejected', limit: 20, offset: 20 });
    expect(screen.getByRole('link', { name: 'Rechazados' }).getAttribute('aria-current')).toBe('page');
  });

  it('las pestañas son links con su query', async () => {
    await renderQueue(new FakeCommentsApi());

    expect(screen.getByRole('link', { name: 'Aprobados' }).getAttribute('href')).toBe('/?status=approved');
    expect(screen.getByRole('link', { name: 'Pendientes · 0' }).getAttribute('href')).toBe('/');
  });

  it('cada pestaña tiene su estado vacío', async () => {
    await renderQueue(new FakeCommentsApi(), { status: 'approved' });

    expect(screen.getByRole('heading', { name: 'Todavía no hay comentarios aprobados' })).toBeTruthy();
  });

  it('si la lista falla, muestra el error y deja reintentar', async () => {
    const api = new FakeCommentsApi();
    // Solo falla la primera petición de la lista, no la del número de pendientes.
    const list = api.list.bind(api);
    let failed = false;
    api.list = (query) => {
      if (query.limit === 20 && !failed) {
        failed = true;
        api.listCalls.push(query);
        return throwError(() => new ApiError('No se pudo conectar con el servidor.', 0, null));
      }
      return list(query);
    };
    const { fixture } = await renderQueue(api);

    expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar');
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fixture.detectChanges();

    expect(api.listCalls.filter((call) => call.limit === 20)).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('al aprobar, recarga, actualiza el número de pendientes, lo anuncia y mueve el foco al título', async () => {
    const api = new FakeCommentsApi();
    api.comments = [aComment({ id: 'a', name: 'Valeria' }), aComment({ id: 'b', name: 'Diego' })];
    const { fixture } = await renderQueue(api);
    // La página pide el número de pendientes por su cuenta (en móvil el menú no está).
    expect(screen.getByRole('link', { name: 'Pendientes · 2' })).toBeTruthy();

    await fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar y publicar' })[0]);
    fixture.detectChanges();

    expect(screen.getByRole('status').textContent).toBe('Se aprobó el comentario de Valeria: ya se ve en el post.');
    expect(screen.queryByRole('heading', { name: 'Valeria' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Pendientes · 1' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Comentarios' }));
  });

  it('pagina de 20 en 20', async () => {
    const api = new FakeCommentsApi();
    api.comments = Array.from({ length: 25 }, (_, i) => aComment({ id: `c${i}`, name: `Persona ${i}` }));
    const { navigate } = await renderQueue(api);

    expect(screen.getByText('1–20 de 25')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(navigate).toHaveBeenCalledWith([], { queryParams: { offset: 20 }, queryParamsHandling: 'merge' });
  });

  it('con una sola página no muestra la paginación', async () => {
    const api = new FakeCommentsApi();
    api.comments = [aComment()];
    await renderQueue(api);

    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });
});
