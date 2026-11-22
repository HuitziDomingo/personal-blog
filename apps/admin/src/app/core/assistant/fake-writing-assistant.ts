import { Injectable, Provider } from '@angular/core';
import { defer, delay, Observable, of, throwError } from 'rxjs';

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

/** Espera simulada, para ver el estado de carga. */
export const FAKE_ASSISTANT_DELAY_MS = 700;

/**
 * Implementación falsa de WritingAssistant: ejemplos fijos, sin ninguna
 * petición de red. Con el contenido vacío falla, para poder ver el estado de
 * error.
 */
@Injectable()
export class FakeWritingAssistant implements WritingAssistant {
  readonly suggestsCover = true;
  readonly notice = 'Sugerencias de ejemplo: todavía no hay ningún modelo conectado.';

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

  contextAvailable(): Observable<boolean> {
    return of(true);
  }

  improveWithContext(draft: ContextDraftInput): Observable<ContextSuggestion> {
    return this.answer(draft, () =>
      toContextSuggestion(
        [
          '- La sección sobre herramientas repite lo que ya explicaste en «Orquestar agentes de IA»: resúmela y enlázalo.',
          '- En tus otros posts dices «orquestador», no «coordinador»: usa el mismo término.',
        ].join('\n'),
        [
          { postId: 'fake-1', slug: 'orquestar-agentes-de-ia', title: 'Orquestar agentes de IA', section: 'Límites por agente', score: 0.82 },
          { postId: 'fake-2', slug: 'workflows-antes-que-agentes', title: 'Workflows antes que agentes', section: '', score: 0.71 },
        ],
        [{ slug: 'orquestar-agentes-de-ia', reason: 'En la introducción, donde mencionas al orquestador.' }],
        [{ slug: 'workflows-antes-que-agentes', note: 'Allí recomiendas empezar con un workflow fijo; aquí, con un agente autónomo.' }],
      ),
    );
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
