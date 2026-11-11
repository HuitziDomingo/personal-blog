import { HttpClient } from '@angular/common/http';
import { inject, Injectable, Provider } from '@angular/core';
import { catchError, defer, map, Observable, throwError } from 'rxjs';

import { AssistantDraft, AssistantMetadata, ImprovedWriting } from '../api/api-types';
import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { AssistantError, CoverIdea, DraftInput, MetadataSuggestion, WritingAssistant } from './writing-assistant';

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

  /** La v1 de la API no sugiere portada (ADR-021, punto 1). */
  readonly suggestsCover = false;
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

  suggestCover(): Observable<CoverIdea> {
    // El panel no ofrece la acción (suggestsCover es false); esto solo cubre
    // una llamada por error.
    return throwError(() => new AssistantError('La idea de portada no está disponible.'));
  }

  private post<T>(path: string, draft: DraftInput): Observable<T> {
    return defer(() => {
      const problem = draftProblem(draft);
      if (problem !== null) {
        return throwError(() => new AssistantError(problem));
      }

      // Solo el título y el contenido (ADR-021): nada más del formulario.
      const body: AssistantDraft = { title: draft.title, content: draft.content };

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
