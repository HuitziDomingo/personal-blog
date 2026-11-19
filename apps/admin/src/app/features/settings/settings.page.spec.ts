import { HttpErrorResponse } from '@angular/common/http';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { Observable, of, Subject, throwError } from 'rxjs';

import { RagStatus, ReindexResult } from '../../core/api/api-types';
import { RagApi } from '../../core/api/rag-api';
import { ApiError } from '../../core/http/api-error';
import { reindexSummary, SettingsPage } from './settings.page';

const ENABLED: RagStatus = { enabled: true, model: 'gemini-embedding-2', publishedPosts: 12, indexedPosts: 10, pendingPosts: 2, chunks: 57 };
const DISABLED: RagStatus = { enabled: false, model: '', publishedPosts: 0, indexedPosts: 0, pendingPosts: 0, chunks: 0 };

/** Doble de RagApi (ADR-015): el reindexado responde cuando el test decide. */
class FakeRagApi {
  statuses: Observable<RagStatus>[] = [];
  statusCalls = 0;
  reindexCalls = 0;
  reindexResponse = new Subject<ReindexResult>();

  status(): Observable<RagStatus> {
    this.statusCalls++;
    return this.statuses.shift() ?? of(ENABLED);
  }

  reindex(): Observable<ReindexResult> {
    this.reindexCalls++;
    return this.reindexResponse.asObservable();
  }
}

async function renderPage(api = new FakeRagApi()) {
  const result = await render(SettingsPage, { providers: [{ provide: RagApi, useValue: api }] });
  return { ...result, api };
}

const announcement = () => screen.getByTestId('rag-announcement');

describe('SettingsPage', () => {
  it('muestra el estado del índice', async () => {
    await renderPage();

    const status = screen.getByTestId('rag-status');
    expect(status.textContent).toContain('gemini-embedding-2');
    expect(status.textContent).toMatch(/Pendientes\s*2/);
    expect(screen.getByRole('button', { name: 'Reindexar todo' })).toBeTruthy();
  });

  it('con el RAG apagado lo dice y no ofrece reindexar', async () => {
    const api = new FakeRagApi();
    api.statuses = [of(DISABLED)];
    await renderPage(api);

    expect(screen.getByTestId('rag-disabled').textContent).toContain('RAG_ENABLED=false');
    expect(screen.queryByRole('button', { name: 'Reindexar todo' })).toBeNull();
  });

  it('si el estado falla, muestra el error y deja reintentar', async () => {
    const api = new FakeRagApi();
    api.statuses = [throwError(() => ApiError.from(new HttpErrorResponse({ status: 0 })))];
    await renderPage(api);

    expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar');
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(api.statusCalls).toBe(2);
    expect(screen.getByTestId('rag-status')).toBeTruthy();
  });

  it('pide confirmación antes de reindexar y cancelar no llama a la API', async () => {
    const { api } = await renderPage();

    await fireEvent.click(screen.getByRole('button', { name: 'Reindexar todo' }));
    const confirm = screen.getByRole('button', { name: 'Sí, reindexar' });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    expect(screen.getByRole('group').textContent).toContain('12 posts publicados');

    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.reindexCalls).toBe(0);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reindexar todo' })));
  });

  it('reindexa, anuncia el resultado y actualiza el estado', async () => {
    const { api, fixture } = await renderPage();

    await fireEvent.click(screen.getByRole('button', { name: 'Reindexar todo' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Sí, reindexar' }));

    const running = screen.getByRole('button', { name: 'Reindexando…' });
    expect(running.hasAttribute('disabled')).toBe(true);
    expect(running.getAttribute('aria-busy')).toBe('true');
    expect(announcement().textContent).toContain('Reindexando');

    api.statuses = [of({ ...ENABLED, indexedPosts: 12, pendingPosts: 0, chunks: 60 })];
    api.reindexResponse.next({ posts: 12, indexed: 12, pending: 0, removed: 1, chunks: 60 });
    fixture.detectChanges();

    expect(announcement().textContent).toContain('Listo: 12 de 12 posts indexados, con 60 fragmentos.');
    expect(announcement().textContent).toContain('1 post que ya no está publicado');
    expect(screen.getByTestId('rag-status').textContent).toMatch(/Pendientes\s*0/);
  });

  it('muestra el error del reindexado', async () => {
    const { api, fixture } = await renderPage();

    await fireEvent.click(screen.getByRole('button', { name: 'Reindexar todo' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Sí, reindexar' }));
    api.reindexResponse.error(
      ApiError.from(new HttpErrorResponse({ status: 503, error: { detail: 'rag is disabled' } }), 'rag'),
    );
    fixture.detectChanges();

    expect(screen.getByRole('alert').textContent).toContain('RAG_ENABLED=false');
    expect(screen.getByRole('button', { name: 'Reindexar todo' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('reindexSummary', () => {
  it('dice cuántos quedaron pendientes', () => {
    expect(reindexSummary({ posts: 5, indexed: 2, pending: 3, removed: 0, chunks: 9 })).toBe(
      'Listo: 2 de 5 posts indexados, con 9 fragmentos. 3 quedaron pendientes porque Gemini falló o agotó su cuota; inténtalo más tarde.',
    );
  });
});
