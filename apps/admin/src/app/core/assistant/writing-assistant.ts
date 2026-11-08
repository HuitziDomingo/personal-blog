import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { FakeWritingAssistant } from './fake-writing-assistant';

/** El borrador sobre el que se pide una sugerencia. */
export interface DraftInput {
  title: string;
  content: string;
}

/** Título, extracto y etiquetas sugeridos. */
export interface MetadataSuggestion {
  title: string;
  excerpt: string;
  tags: string[];
}

/** Una idea de portada: qué mostrar y su texto alternativo. No es una imagen. */
export interface CoverIdea {
  description: string;
  altText: string;
}

/**
 * Puerto del asistente de escritura. La interfaz del editor solo conoce esta
 * clase; hoy la implementa FakeWritingAssistant, sin red. Un proveedor real
 * irá detrás de la API, con su contrato y su ADR, nunca llamado desde el
 * navegador.
 */
@Injectable({ providedIn: 'root', useExisting: FakeWritingAssistant })
export abstract class WritingAssistant {
  /** El Markdown con la redacción mejorada. */
  abstract improveWriting(draft: DraftInput): Observable<string>;
  abstract suggestMetadata(draft: DraftInput): Observable<MetadataSuggestion>;
  abstract suggestCover(draft: DraftInput): Observable<CoverIdea>;
}

/**
 * El build lo reemplaza con el `define` de la configuración activa en
 * `angular.json`: true en development y false en production.
 */
declare const ADMIN_ASSISTANT_ENABLED: boolean;

/** Muestra el panel «Asistente» en el editor. Apagado en producción. */
export const ASSISTANT_ENABLED = new InjectionToken<boolean>('ASSISTANT_ENABLED', {
  providedIn: 'root',
  factory: () => ADMIN_ASSISTANT_ENABLED,
});

/** Atajo para componentes. */
export function injectAssistantEnabled(): boolean {
  return inject(ASSISTANT_ENABLED);
}
