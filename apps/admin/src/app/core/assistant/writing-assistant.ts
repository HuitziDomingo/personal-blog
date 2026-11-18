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

/**
 * Una idea de portada: qué mostrar y su texto alternativo. No es una imagen.
 * Contra la API, `description` es el tema en inglés que usará el generador de
 * imágenes (ADR-026) y `altText`, el texto alternativo en el idioma del post.
 */
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
 * clase. La implementación se elige al proveerla: HttpWritingAssistant en la
 * ruta del editor, contra la API (ADR-021), y FakeWritingAssistant en los
 * tests. El proveedor del modelo va detrás de la API, nunca llamado desde el
 * navegador.
 */
export abstract class WritingAssistant {
  /**
   * Si ofrece la idea de portada. El panel oculta esa acción cuando es false.
   * La API la ofrece desde ADR-026 (punto 2).
   */
  abstract readonly suggestsCover: boolean;
  /** Aviso que el panel muestra bajo su título: de dónde salen las sugerencias. */
  abstract readonly notice: string;
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
