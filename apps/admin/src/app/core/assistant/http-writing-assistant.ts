import { HttpClient } from '@angular/common/http';
import { inject, Injectable, Provider } from '@angular/core';
import { catchError, defer, map, Observable, of, throwError } from 'rxjs';

import { AssistantDraft, AssistantMetadata, ContextDraft, ContextualSuggestion, CoverSuggestion, ImprovedWriting, RagStatus } from '../api/api-types';
import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import {
  AssistantError,
  ContextDraftInput,
  ContextSuggestion,
  CoverIdea,
  DraftInput,
  MetadataSuggestion,
  toContextSuggestion,
  WritingAssistant,
} from './writing-assistant';

/** Máximo de `content` en AssistantDraft (openapi.yaml), en caracteres. */
export const MAX_ASSISTANT_CONTENT = 50000;

/**
 * WritingAssistant contra las operaciones del asistente de la API (ADR-021).
 * Los errores salen como AssistantError, con el mensaje en español.
 */
@Injectable()
export class HttpWritingAssistant implements WritingAssistant {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** La idea de portada en texto (ADR-026, punto 2); la API valida los dos campos. */
  readonly suggestsCover = true;
  readonly notice =
    'Sugerencias de Gemini en su plan gratuito: Google puede usar el borrador para mejorar sus modelos. No lo uses con borradores privados.';

  improveWriting(draft: DraftInput): Observable<string> {
    return this.post<ImprovedWriting>(API_PATHS.improveWriting, draft).pipe(map((improved) => improved.content));
  }

  suggestMetadata(draft: DraftInput): Observable<MetadataSuggestion> {
    return this.post<AssistantMetadata>(API_PATHS.suggestMetadata, draft).pipe(
      map(({ title, excerpt, tags }) => ({ title, excerpt, tags })),
    );
  }

  suggestCover(draft: DraftInput): Observable<CoverIdea> {
    return this.post<CoverSuggestion>(API_PATHS.suggestCover, draft).pipe(
      map(({ subject, alt }) => ({ description: subject, altText: alt })),
    );
  }

  /** El estado del RAG (ADR-027). Si la petición falla, el botón no se muestra. */
  contextAvailable(): Observable<boolean> {
    return this.http.get<RagStatus>(`${this.baseUrl}${API_PATHS.ragStatus}`).pipe(
      map((status) => status.enabled),
      catchError(() => of(false)),
    );
  }

  improveWithContext(draft: ContextDraftInput): Observable<ContextSuggestion> {
    // Solo título, contenido y el id del post (ADR-021 y ADR-027).
    const body: ContextDraft = { title: draft.title, content: draft.content };
    if (draft.postId !== null) {
      body.postId = draft.postId;
    }

    return this.post<ContextualSuggestion>(API_PATHS.improveWithContext, draft, body).pipe(
      map((result) => toContextSuggestion(result.suggestion, result.context, result.internalLinks, result.contradictions)),
    );
  }

  private post<T>(path: string, draft: DraftInput, body: AssistantDraft | ContextDraft = { title: draft.title, content: draft.content }): Observable<T> {
    return defer(() => {
      const problem = draftProblem(draft);
      if (problem !== null) {
        return throwError(() => new AssistantError(problem));
      }

      // Solo el título y el contenido (ADR-021): nada más del formulario.
      return this.http.post<T>(`${this.baseUrl}${path}`, body);
    }).pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof AssistantError ? error : new AssistantError(ApiError.from(error, 'assistant').message))),
      ),
    );
  }
}

// Lo que el contrato rechazaría con 400, dicho antes de enviar.
function draftProblem(draft: DraftInput): string | null {
  if (draft.content.trim() === '') {
    return 'Escribe algo de contenido antes de pedir una sugerencia.';
  }
  // maxLength de JSON Schema cuenta caracteres (code points), no unidades UTF-16.
  if (Array.from(draft.content).length > MAX_ASSISTANT_CONTENT) {
    return 'El contenido es demasiado largo para el asistente: el máximo es de 50 000 caracteres.';
  }

  return null;
}

/** Provee el adaptador HTTP como implementación del puerto. */
export function provideHttpWritingAssistant(): Provider {
  return { provide: WritingAssistant, useClass: HttpWritingAssistant };
}
