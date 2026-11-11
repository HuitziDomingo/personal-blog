import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { Subject } from 'rxjs';

import { Comment } from '../../core/api/api-types';
import { CommentsApi } from '../../core/api/comments-api';
import { aComment, FakeCommentsApi } from '../../core/comments/comments-fakes';
import { ApiError } from '../../core/http/api-error';
import { CommentCard, CommentDecision } from './comment-card';

async function renderCard(comment: Comment, api = new FakeCommentsApi()) {
  api.comments = [comment];
  const decided: CommentDecision[] = [];
  const notices: string[] = [];
  const result = await render(CommentCard, {
    inputs: { comment },
    on: { decided: (event: CommentDecision) => decided.push(event), notice: (text: string) => notices.push(text) },
    providers: [provideRouter([]), { provide: CommentsApi, useValue: api }],
  });
  return { ...result, api, decided, notices };
}

describe('CommentCard', () => {
  it('muestra nombre, post, fecha y el contenido como texto, con el código en línea', async () => {
    const { container } = await renderCard(
      aComment({ content: 'Mira `<b>x</b>` y <img src=x onerror=alert(1)>' }),
    );

    expect(screen.getByRole('heading', { name: 'Valeria' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '«Métodos de Array»' }).getAttribute('href')).toBe('/posts/p1');
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-11T10:00:00.000Z');
    expect(container.querySelector('code')?.textContent).toBe('<b>x</b>');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
  });

  it('sin post, lo dice', async () => {
    await renderCard(aComment({ postTitle: undefined, postSlug: undefined }));

    expect(screen.getByText(/en un post que ya no existe/)).toBeTruthy();
  });

  it('sin análisis lo dice y no muestra motivo', async () => {
    await renderCard(aComment());

    expect(screen.getByText('Sin análisis')).toBeTruthy();
    expect(screen.queryByText('Motivo del modelo:')).toBeNull();
  });

  it('muestra el veredicto y el motivo del modelo', async () => {
    await renderCard(
      aComment({
        moderation: { verdict: 'reject', category: 'spam', reason: 'Promoción ajena.', model: 'gemini', analyzedAt: '2026-11-11T10:05:00Z' },
      }),
    );

    expect(screen.getByText('Sugiere rechazar · spam')).toBeTruthy();
    expect(screen.getByText(/Promoción ajena\./)).toBeTruthy();
    // Si sugiere rechazar, «Rechazar» es la principal y aprobar pide confirmación en el texto.
    expect(screen.getByRole('button', { name: 'Aprobar de todos modos' })).toBeTruthy();
  });

  it('resalta prompt injection para revisión humana aunque el modelo diga aprobar', async () => {
    const { container } = await renderCard(
      aComment({
        moderation: { verdict: 'approve', category: 'prompt_injection', reason: 'Da órdenes.', model: 'g', analyzedAt: '2026-11-11T10:05:00Z' },
      }),
    );

    expect(screen.getByText('Revisión humana · posible prompt injection')).toBeTruthy();
    expect(container.querySelector('article')?.classList).toContain('comment-card-review');
    expect(screen.getByRole('button', { name: 'Aprobar de todos modos' })).toBeTruthy();
  });

  it('aprobar avisa a la cola con el comentario actualizado', async () => {
    const { api, decided } = await renderCard(aComment());

    await fireEvent.click(screen.getByRole('button', { name: 'Aprobar y publicar' }));

    expect(api.calls).toEqual([{ action: 'approve', id: 'c1' }]);
    expect(decided).toEqual([{ comment: expect.objectContaining({ id: 'c1', status: 'approved' }), action: 'approve' }]);
  });

  it('rechazar avisa a la cola', async () => {
    const { decided } = await renderCard(aComment());

    await fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(decided[0].action).toBe('reject');
  });

  it('mientras decide, bloquea los botones', async () => {
    const api = new FakeCommentsApi();
    const response = new Subject<Comment>();
    api.nextResponse.approve = response;
    await renderCard(aComment(), api);

    await fireEvent.click(screen.getByRole('button', { name: 'Aprobar y publicar' }));

    expect((screen.getByRole('button', { name: 'Rechazar' }) as HTMLButtonElement).disabled).toBe(true);
    response.complete();
  });

  it('volver a analizar reemplaza el veredicto y lo anuncia', async () => {
    const { notices, fixture } = await renderCard(aComment());

    await fireEvent.click(screen.getByRole('button', { name: 'Volver a analizar' }));
    fixture.detectChanges();

    expect(screen.getByText('Sugiere aprobar')).toBeTruthy();
    expect(notices).toEqual(['Análisis actualizado para el comentario de Valeria: Sugiere aprobar.']);
  });

  it('si el análisis falla, muestra el error en la tarjeta', async () => {
    const api = new FakeCommentsApi();
    api.nextError.analyze = new ApiError('La moderación con IA está desactivada en la API.', 503, null);
    await renderCard(aComment(), api);

    await fireEvent.click(screen.getByRole('button', { name: 'Volver a analizar' }));

    expect(screen.getByRole('alert').textContent).toContain('La moderación con IA está desactivada');
  });

  it('solo se responde a comentarios aprobados que no son respuesta ni del autor', async () => {
    await renderCard(aComment({ status: 'pending' }));
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
  });

  it('las respuestas del autor no se analizan ni se responden', async () => {
    await renderCard(aComment({ status: 'approved', byAuthor: true, parentId: 'c0' }));

    expect(screen.getByText('Autor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver a analizar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
  });

  it('responde como autor, cuenta los caracteres y lo anuncia', async () => {
    const { api, notices } = await renderCard(aComment({ status: 'approved' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    const field = screen.getByLabelText('Tu respuesta como autor') as HTMLTextAreaElement;
    expect((screen.getByRole('button', { name: 'Publicar respuesta' }) as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.input(field, { target: { value: 'Gracias, lo agrego.' } });
    expect(screen.getByText('19 / 2000')).toBeTruthy();
    expect(field.maxLength).toBe(2000);
    await fireEvent.click(screen.getByRole('button', { name: 'Publicar respuesta' }));

    expect(api.calls).toEqual([{ action: 'reply', id: 'c1', content: 'Gracias, lo agrego.' }]);
    expect(notices).toEqual(['Se publicó tu respuesta a Valeria.']);
    expect(screen.queryByLabelText('Tu respuesta como autor')).toBeNull();
  });

  it('si responder falla, conserva el texto y muestra el error', async () => {
    const api = new FakeCommentsApi();
    api.nextError.reply = new ApiError('No se pudo responder.', 400, null);
    await renderCard(aComment({ status: 'approved' }), api);

    await fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await fireEvent.input(screen.getByLabelText('Tu respuesta como autor'), { target: { value: 'Hola' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Publicar respuesta' }));

    expect(screen.getByRole('alert').textContent).toContain('No se pudo responder.');
    expect((screen.getByLabelText('Tu respuesta como autor') as HTMLTextAreaElement).value).toBe('Hola');
  });
});
