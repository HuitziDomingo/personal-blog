import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { Comment, CommentPage, CommentStatus } from './api-types';

/** Máximos del contrato para la paginación (`Limit` y `Offset` en openapi.yaml). */
export const MAX_COMMENT_OFFSET = 10000;

/** Largo máximo de una respuesta del autor (`AuthorReply` en openapi.yaml). */
export const MAX_REPLY_LENGTH = 2000;

export interface CommentListQuery {
  status?: CommentStatus;
  limit: number;
  offset: number;
}

/**
 * Endpoints de admin de comentarios (ADR-022). Los errores salen como
 * `ApiError`, con el mensaje ya traducido al español.
 */
@Injectable({ providedIn: 'root' })
export class CommentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}${API_PATHS.adminComments}`;

  list(query: CommentListQuery): Observable<CommentPage> {
    let params = new HttpParams().set('limit', query.limit).set('offset', query.offset);
    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http.get<CommentPage>(this.baseUrl, { params }).pipe(translate());
  }

  approve(id: string): Observable<Comment> {
    return this.http.post<Comment>(this.actionUrl(id, 'approve'), null).pipe(translate());
  }

  reject(id: string): Observable<Comment> {
    return this.http.post<Comment>(this.actionUrl(id, 'reject'), null).pipe(translate());
  }

  /** Pide de nuevo la sugerencia del modelo. No cambia el estado del comentario. */
  analyze(id: string): Observable<Comment> {
    return this.http.post<Comment>(this.actionUrl(id, 'analyze'), null).pipe(translate());
  }

  /** Respuesta del autor: se publica aprobada. */
  reply(id: string, content: string): Observable<Comment> {
    return this.http.post<Comment>(this.actionUrl(id, 'replies'), { content }).pipe(translate());
  }

  // Igual que en PostsApi: el ID no debe poder cambiar la ruta de la petición.
  private actionUrl(id: string, action: 'approve' | 'reject' | 'analyze' | 'replies'): string {
    return `${this.baseUrl}/${encodeURIComponent(id).replaceAll('.', '%2E')}/${action}`;
  }
}

function translate<T>() {
  return catchError<T, Observable<never>>((error: unknown) =>
    throwError(() => ApiError.from(error, 'comment')),
  );
}
