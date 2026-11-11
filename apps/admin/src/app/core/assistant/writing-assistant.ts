import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

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

/** Error del asistente con un mensaje ya en español para mostrarlo. */
export class AssistantError extends Error {
  override readonly name = 'AssistantError';
}

/**
 * Puerto del asistente de escritura: la interfaz del editor solo conoce esta
 * clase. La implementación se elige al proveerla (hoy, FakeWritingAssistant en
 * las rutas de posts). El proveedor real va detrás de la API (ADR-021), nunca
 * llamado desde el navegador; el adaptador HTTP es BLOG-081.
 */
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
declare const ADMIN_ASSISTANT_ENABLED: boolean | undefined;

/**
 * Muestra el panel «Asistente» en el editor. Falla cerrado: sin el `define`, o
 * con cualquier valor que no sea true, queda apagado.
 */
export const ASSISTANT_ENABLED = new InjectionToken<boolean>('ASSISTANT_ENABLED', {
  providedIn: 'root',
  factory: () => typeof ADMIN_ASSISTANT_ENABLED !== 'undefined' && ADMIN_ASSISTANT_ENABLED === true,
});
