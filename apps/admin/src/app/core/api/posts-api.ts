import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { Post, PostPage, PostStatus, PostWrite } from './api-types';

/** Máximos del contrato para la paginación (`Limit` y `Offset` en openapi.yaml). */
export const MAX_POST_LIMIT = 100;
export const MAX_POST_OFFSET = 10000;

export interface PostListQuery {
  status?: PostStatus;
  limit: number;
  offset: number;
}

/**
 * Endpoints de admin de posts. Los errores salen como `ApiError`, con el
 * mensaje ya traducido al español.
 */
@Injectable({ providedIn: 'root' })
export class PostsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}${API_PATHS.adminPosts}`;

  list(query: PostListQuery): Observable<PostPage> {
    let params = new HttpParams().set('limit', query.limit).set('offset', query.offset);
    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http.get<PostPage>(this.baseUrl, { params }).pipe(translate());
  }

  get(id: string): Observable<Post> {
    return this.http.get<Post>(this.postUrl(id)).pipe(translate());
  }

  create(post: PostWrite): Observable<Post> {
    return this.http.post<Post>(this.baseUrl, post).pipe(translate());
  }

  update(id: string, post: PostWrite): Observable<Post> {
    return this.http.put<Post>(this.postUrl(id), post).pipe(translate());
  }

  /** `DELETE` archiva: la API no borra posts. */
  archive(id: string): Observable<void> {
    return this.http.delete<void>(this.postUrl(id)).pipe(
      map(() => undefined),
      translate(),
    );
  }

  // El ID viene de la URL del admin y no debe poder cambiar la ruta de la
  // petición. encodeURIComponent codifica `/`, `?` y `#`, pero no los puntos, y
  // el navegador resuelve un segmento `..` antes de enviar la petición.
  private postUrl(id: string): string {
    return `${this.baseUrl}/${encodeURIComponent(id).replaceAll('.', '%2E')}`;
  }
}

function translate<T>() {
  return catchError<T, Observable<never>>((error: unknown) =>
    throwError(() => ApiError.from(error, 'post')),
  );
}
