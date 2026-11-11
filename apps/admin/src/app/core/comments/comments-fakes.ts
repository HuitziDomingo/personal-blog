import { Observable, of, throwError } from 'rxjs';

import { Comment, CommentPage } from '../api/api-types';
import { CommentListQuery } from '../api/comments-api';
import { ApiError } from '../http/api-error';

/** Un comentario de ejemplo; `overrides` cambia lo que el test necesite. */
export function aComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    postId: 'p1',
    postTitle: 'Métodos de Array',
    postSlug: 'metodos-de-array',
    name: 'Valeria',
    content: 'Gracias por el post.',
    status: 'pending',
    byAuthor: false,
    createdAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

type Action = 'approve' | 'reject' | 'analyze' | 'reply';

/**
 * Doble de CommentsApi escrito a mano (ADR-015). Guarda los comentarios en
 * memoria y aplica las acciones como la API: aprobar o rechazar cambia el
 * estado, analizar reemplaza `moderation` y responder crea uno aprobado.
 */
export class FakeCommentsApi {
  comments: Comment[] = [];
  listCalls: CommentListQuery[] = [];
  calls: { action: Action; id: string; content?: string }[] = [];
  /** Si está, la próxima llamada de esa acción responde con este error. */
  nextError: Partial<Record<Action | 'list', ApiError>> = {};
  /** Si está, la próxima llamada de esa acción responde con este observable. */
  nextResponse: Partial<Record<Action, Observable<Comment>>> = {};
  /** Lo que devuelve analyze. */
  analysis: Comment['moderation'] = {
    verdict: 'approve',
    category: 'none',
    reason: 'Pregunta relacionada con el artículo.',
    model: 'fake',
    analyzedAt: '2026-11-11T11:00:00.000Z',
  };

  list(query: CommentListQuery): Observable<CommentPage> {
    this.listCalls.push(query);
    const error = this.take('list');
    if (error) {
      return throwError(() => error);
    }
    const matching = this.comments.filter((comment) => !query.status || comment.status === query.status);
    return of({
      items: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  approve(id: string): Observable<Comment> {
    return this.act('approve', id, (comment) => ({ ...comment, status: 'approved' }));
  }

  reject(id: string): Observable<Comment> {
    return this.act('reject', id, (comment) => ({ ...comment, status: 'rejected' }));
  }

  analyze(id: string): Observable<Comment> {
    return this.act('analyze', id, (comment) => ({ ...comment, moderation: this.analysis }));
  }

  reply(id: string, content: string): Observable<Comment> {
    this.calls.push({ action: 'reply', id, content });
    const error = this.take('reply');
    if (error) {
      return throwError(() => error);
    }
    const reply = aComment({ id: `${id}-r`, parentId: id, name: 'Autor', content, status: 'approved', byAuthor: true });
    this.comments.push(reply);
    return this.nextResponse.reply ?? of(reply);
  }

  private act(action: Action, id: string, change: (comment: Comment) => Comment): Observable<Comment> {
    this.calls.push({ action, id });
    const error = this.take(action);
    if (error) {
      return throwError(() => error);
    }
    const pending = this.nextResponse[action];
    if (pending) {
      delete this.nextResponse[action];
      return pending;
    }
    const index = this.comments.findIndex((comment) => comment.id === id);
    if (index < 0) {
      return throwError(() => new ApiError('El comentario ya no existe.', 404, null));
    }
    this.comments[index] = change(this.comments[index]);
    return of(this.comments[index]);
  }

  private take(action: Action | 'list'): ApiError | undefined {
    const error = this.nextError[action];
    delete this.nextError[action];
    return error;
  }
}
