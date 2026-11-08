import { Injectable, Provider } from '@angular/core';
import { defer, delay, Observable, of, throwError } from 'rxjs';

import { AssistantError, CoverIdea, DraftInput, MetadataSuggestion, WritingAssistant } from './writing-assistant';

/** Espera simulada, para ver el estado de carga. */
export const FAKE_ASSISTANT_DELAY_MS = 700;

/**
 * Implementación falsa de WritingAssistant: ejemplos fijos, sin ninguna
 * petición de red. Con el contenido vacío falla, para poder ver el estado de
 * error.
 */
@Injectable()
export class FakeWritingAssistant implements WritingAssistant {
  improveWriting(draft: DraftInput): Observable<string> {
    return this.answer(draft, () =>
      [
        '## Por qué orquestar agentes',
        '',
        'Un solo agente con todas las herramientas se vuelve lento y difícil de depurar. Repartir el trabajo entre un **orquestador** y agentes especializados mantiene cada contexto pequeño y cada decisión trazable.',
        '',
        '- El orquestador planifica y reparte.',
        '- Cada agente resuelve una parte y devuelve un resultado verificable.',
        '',
        '> Ejemplo fijo del asistente de prueba: no analiza tu texto.',
      ].join('\n'),
    );
  }

  suggestMetadata(draft: DraftInput): Observable<MetadataSuggestion> {
    return this.answer(draft, () => ({
      title: 'Orquestación de agentes: del prototipo a producción',
      excerpt: 'Cómo repartir el trabajo entre un orquestador y agentes especializados sin perder trazabilidad.',
      tags: ['agentes', 'orquestacion', 'ia'],
    }));
  }

  suggestCover(draft: DraftInput): Observable<CoverIdea> {
    return this.answer(draft, () => ({
      description: 'Un director de orquesta minimalista frente a varios robots pequeños, cada uno con un instrumento distinto, en tonos azul y ámbar sobre fondo claro.',
      altText: 'Ilustración de un director coordinando a varios robots músicos.',
    }));
  }

  private answer<T>(draft: DraftInput, example: () => T): Observable<T> {
    return defer(() =>
      draft.content.trim() === ''
        ? throwError(() => new AssistantError('Escribe algo de contenido antes de pedir una sugerencia.'))
        : of(example()),
    ).pipe(delay(FAKE_ASSISTANT_DELAY_MS));
  }
}

/** Provee el asistente falso como implementación del puerto. */
export function provideFakeWritingAssistant(): Provider {
  return { provide: WritingAssistant, useClass: FakeWritingAssistant };
}
