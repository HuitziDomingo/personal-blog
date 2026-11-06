import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { Observable, of, Subject, throwError } from 'rxjs';

import { PostPage, PostStatus, PostSummary } from '../../core/api/api-types';
import { PostListQuery, PostsApi } from '../../core/api/posts-api';
import { ApiError } from '../../core/http/api-error';
import { SessionService } from '../../core/session/session.service';
import { PAGE_SIZE, PostsListPage } from './posts-list.page';

function summary(n: number, status: PostStatus = 'draft'): PostSummary {
  return {
    id: `id-${n}`,
    authorId: 'a1',
    title: `Post ${n}`,
    slug: `post-${n}`,
    tags: [],
    status,
    publishedAt: status === 'draft' ? null : '2026-11-02T15:30:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T09:00:00.000Z',
  };
}

/**
 * Fake de PostsApi (ADR-015): guarda posts en memoria, filtra y pagina como la
 * API, y registra las llamadas. `nextList` permite controlar una respuesta.
 */
class FakePostsApi {
  posts: PostSummary[] = [];
  listCalls: PostListQuery[] = [];
  archiveCalls: string[] = [];
  nextList: Observable<PostPage> | null = null;
  nextArchive: Observable<void> | null = null;

  list(query: PostListQuery): Observable<PostPage> {
    this.listCalls.push(query);
    if (this.nextList) {
      const response = this.nextList;
      this.nextList = null;
      return response;
    }
    const matching = this.posts.filter((post) => !query.status || post.status === query.status);
    return of({
      items: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  archive(id: string): Observable<void> {
    this.archiveCalls.push(id);
    if (this.nextArchive) {
      const response = this.nextArchive;
      this.nextArchive = null;
      return response;
    }
    this.posts = this.posts.map((post) => (post.id === id ? { ...post, status: 'archived' } : post));
    return of(undefined);
  }
}

async function renderList(api: FakePostsApi, inputs: { status?: string; offset?: string } = {}) {
  const logout = vi.fn(() => of(undefined));
  const result = await render(PostsListPage, {
    inputs,
    providers: [
      provideRouter([]),
      { provide: PostsApi, useValue: api },
      { provide: SessionService, useValue: { logout } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  return { ...result, navigate, logout };
}

describe('PostsListPage', () => {
  it('muestra los posts con título, estado, fecha de publicación y última edición', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1, 'published'), summary(2, 'draft')];

    await renderList(api);

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const published = within(rows[0]);
    expect(published.getByText('Post 1')).toBeTruthy();
    expect(published.getByText('Publicado')).toBeTruthy();
    expect(rows[0].querySelector('time[datetime="2026-11-02T15:30:00.000Z"]')).toBeTruthy();
    expect(rows[0].querySelector('time[datetime="2026-11-03T09:00:00.000Z"]')).toBeTruthy();
    const draft = within(rows[1]);
    expect(draft.getByText('Borrador')).toBeTruthy();
    expect(draft.getByText('Sin publicar')).toBeTruthy();
    expect(api.listCalls).toEqual([{ status: undefined, limit: PAGE_SIZE, offset: 0 }]);
  });

  it('muestra el estado de carga mientras la API no responde', async () => {
    const api = new FakePostsApi();
    api.nextList = new Subject<PostPage>();

    await renderList(api);

    expect(screen.getByText('Cargando posts…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('muestra el estado vacío sin filtro y con filtro', async () => {
    const api = new FakePostsApi();
    const { fixture } = await renderList(api);

    expect(screen.getByRole('heading', { name: 'Todavía no hay posts' })).toBeTruthy();

    fixture.componentRef.setInput('status', 'archived');
    await fixture.whenStable();
    expect(await screen.findByRole('heading', { name: 'No hay posts en «Archivado»' })).toBeTruthy();
  });

  it('muestra el error traducido y reintenta', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];
    api.nextList = throwError(() => ApiError.from(new HttpErrorResponse({ status: 0 }), 'post'));

    await renderList(api);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No se pudo conectar con el servidor');
    await fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Post 1')).toBeTruthy();
    expect(api.listCalls).toHaveLength(2);
  });

  it('filtra por estado desde la URL y cambia el filtro con navegación', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1, 'published'), summary(2, 'draft')];

    const { navigate } = await renderList(api, { status: 'draft', offset: '40' });

    expect(api.listCalls).toEqual([{ status: 'draft', limit: PAGE_SIZE, offset: 40 }]);
    const select = screen.getByLabelText('Estado') as HTMLSelectElement;
    expect(select.value).toBe('draft');

    await fireEvent.change(select, { target: { value: 'published' } });
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { status: 'published', offset: null },
      queryParamsHandling: 'merge',
    });

    await fireEvent.change(select, { target: { value: '' } });
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { status: null, offset: null },
      queryParamsHandling: 'merge',
    });
  });

  it.each([
    { status: 'borrado', offset: '-5' },
    { offset: '20000' },
    { offset: '7.5' },
    { offset: 'abc' },
  ])('ignora un estado o un offset inválidos en la URL: %o', async (inputs) => {
    const api = new FakePostsApi();

    await renderList(api, inputs);

    expect(api.listCalls).toEqual([{ status: undefined, limit: PAGE_SIZE, offset: 0 }]);
  });

  it('pagina con limit y offset y desactiva los extremos', async () => {
    const api = new FakePostsApi();
    api.posts = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => summary(i + 1));

    const { navigate, fixture } = await renderList(api);

    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByText(`1–${PAGE_SIZE} de ${PAGE_SIZE + 5}`)).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Anterior' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(within(nav).getByRole('button', { name: 'Siguiente' }));
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { offset: PAGE_SIZE }, queryParamsHandling: 'merge' });

    fixture.componentRef.setInput('offset', String(PAGE_SIZE));
    await fixture.whenStable();
    const lastNav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(lastNav).getByText(`${PAGE_SIZE + 1}–${PAGE_SIZE + 5} de ${PAGE_SIZE + 5}`)).toBeTruthy();
    expect(within(lastNav).getByRole('button', { name: 'Siguiente' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(within(lastNav).getByRole('button', { name: 'Anterior' }));
    expect(navigate).toHaveBeenLastCalledWith([], { queryParams: { offset: null }, queryParamsHandling: 'merge' });
  });

  it('una página vacía más allá del final ofrece volver a la primera', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];

    const { navigate } = await renderList(api, { offset: '40' });

    expect(screen.getByRole('heading', { name: 'Esta página no tiene posts' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }));
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { offset: null }, queryParamsHandling: 'merge' });
  });

  it('archiva tras confirmar en un diálogo accesible y recarga la lista', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1, 'published'), summary(2, 'archived')];

    await renderList(api);

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[1]).queryByRole('button', { name: /Archivar/ })).toBeNull();
    await fireEvent.click(within(rows[0]).getByRole('button', { name: 'Archivar «Post 1»' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: '¿Archivar este post?' })).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(api.archiveCalls).toEqual([]);

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }));

    expect(api.archiveCalls).toEqual(['id-1']);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Se archivó «Post 1».')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Posts' }));
    expect(api.listCalls).toHaveLength(2);
    expect(within(screen.getAllByRole('row')[1]).getByText('Archivado')).toBeTruthy();
  });

  it('cancelar el diálogo no archiva', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];

    await renderList(api);

    await fireEvent.click(screen.getByRole('button', { name: 'Archivar «Post 1»' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.archiveCalls).toEqual([]);
    expect(api.listCalls).toHaveLength(1);
  });

  it('si archivar falla, el diálogo sigue abierto con el error', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];
    api.nextArchive = throwError(() =>
      ApiError.from(new HttpErrorResponse({ status: 404, error: { detail: 'post not found' } }), 'post'),
    );

    await renderList(api);

    await fireEvent.click(screen.getByRole('button', { name: 'Archivar «Post 1»' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }));

    expect(within(dialog).getByRole('alert').textContent).toContain('El post no existe o ya no está disponible.');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Archivar' }).hasAttribute('disabled')).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(false);
    expect(api.listCalls).toHaveLength(1);
  });

  it('cerrar el diálogo con Escape mientras se archiva muestra el error en la página y deja volver a abrirlo', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1), summary(2)];
    const pending = new Subject<void>();
    api.nextArchive = pending;

    await renderList(api);

    await fireEvent.click(screen.getByRole('button', { name: 'Archivar «Post 1»' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }));
    await fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    pending.error(ApiError.from(new HttpErrorResponse({ status: 500 }), 'post'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No se pudo archivar «Post 1». Error inesperado del servidor.'),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Archivar «Post 2»' }));
    const second = await screen.findByRole('alertdialog');
    expect(second.textContent).toContain('«Post 2»');
    expect(screen.queryByRole('alert', { name: /No se pudo archivar/ })).toBeNull();
  });

  it('el aviso de archivado es visible y se repite aunque el título sea el mismo', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1), { ...summary(2), title: 'Post 1' }];

    await renderList(api);

    const archive = async (index: number) => {
      await fireEvent.click(screen.getAllByRole('button', { name: 'Archivar «Post 1»' })[index]);
      const dialog = await screen.findByRole('alertdialog');
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    };

    await archive(0);
    const status = screen.getByText('Se archivó «Post 1».');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.classList.contains('sr-only')).toBe(false);
    await archive(0);
    expect(api.archiveCalls).toEqual(['id-1', 'id-2']);
    expect(screen.getByRole('status').textContent).toBe('Se archivó «Post 1».');
  });

  it('no deja pasar de la página con offset 10000, el máximo del contrato', async () => {
    const api = new FakePostsApi();
    api.nextList = of({ items: [summary(1)], total: 20000, limit: PAGE_SIZE, offset: 10000 });

    await renderList(api, { offset: '10000' });

    expect(api.listCalls[0].offset).toBe(10000);
    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByRole('button', { name: 'Siguiente' }).hasAttribute('disabled')).toBe(true);
  });

  it('muestra el título completo en el atributo title de la celda', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];

    await renderList(api);

    const link = screen.getByRole('link', { name: 'Post 1' });
    expect(link.closest('td')?.getAttribute('title')).toBe('Post 1');
  });

  it('enlaza cada título a su editor y ofrece crear un post', async () => {
    const api = new FakePostsApi();
    api.posts = [summary(1)];

    await renderList(api);

    expect(screen.getByRole('link', { name: 'Post 1' }).getAttribute('href')).toBe('/posts/id-1');
    expect(screen.getByRole('link', { name: 'Nuevo post' }).getAttribute('href')).toBe('/posts/new');
  });

  it('cierra la sesión desde la cabecera', async () => {
    const api = new FakePostsApi();
    const { logout } = await renderList(api);

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(logout).toHaveBeenCalledOnce();
  });
});
