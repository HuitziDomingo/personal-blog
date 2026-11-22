import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { RagStatus, ReindexResult } from './api-types';

/**
 * El índice de los posts publicados para «mejorar con mi contexto» (ADR-027).
 * Los errores salen como `ApiError`, con el mensaje ya traducido al español.
 */
@Injectable({ providedIn: 'root' })
export class RagApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Con el RAG apagado responde `enabled: false`, no un error. */
  status(): Observable<RagStatus> {
    return this.http.get<RagStatus>(`${this.baseUrl}${API_PATHS.ragStatus}`).pipe(
      catchError((error: unknown) => throwError(() => ApiError.from(error, 'generic'))),
    );
  }

  /** Regenera los embeddings de todos los posts publicados. Puede tardar. */
  reindex(): Observable<ReindexResult> {
    return this.http.post<ReindexResult>(`${this.baseUrl}${API_PATHS.ragReindex}`, null).pipe(
      catchError((error: unknown) => throwError(() => ApiError.from(error, 'rag'))),
    );
  }
}
