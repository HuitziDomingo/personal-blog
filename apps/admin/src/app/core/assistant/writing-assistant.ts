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

/** El borrador para «mejorar con mi contexto»: con el id del post si ya existe. */
export interface ContextDraftInput extends DraftInput {
  /** El post que se edita: sus propios fragmentos no son contexto. Null si es nuevo. */
  postId: string | null;
}

/** Un fragmento de un post publicado que se usó como contexto. */
export interface ContextSourceView {
  postId: string;
  slug: string;
  title: string;
  /** Título de la sección; vacío si es el texto antes del primer encabezado. */
  section: string;
  score: number;
}

/** Un post usado como contexto, con sus secciones, para listarlo una vez. */
export interface ContextPost {
  postId: string;
  slug: string;
  title: string;
  sections: string[];
}

/**
 * La sugerencia de «mejorar con mi contexto» (ADR-027). Links y
 * contradicciones solo apuntan a posts de `posts`, que traen su título.
 */
export interface ContextSuggestion {
  /** Markdown no confiable: se renderiza con el sanitizado de los posts. */
  suggestion: string;
  internalLinks: { postId: string; title: string; reason: string }[];
  contradictions: { postId: string; title: string; note: string }[];
  /** Los posts usados como contexto, del más parecido al menos. Vacío si ninguno superó el umbral. */
  posts: ContextPost[];
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
  /**
   * Si «mejorar con mi contexto» está disponible: la API lo dice en el estado
   * del RAG. Emite false si está apagado o si no se pudo saber.
   */
  abstract contextAvailable(): Observable<boolean>;
  abstract improveWithContext(draft: ContextDraftInput): Observable<ContextSuggestion>;
}

/**
 * Agrupa los fragmentos por post, en el orden del más parecido, y resuelve el
 * título de cada link y contradicción. Un link a un post que no está en el
 * contexto se descarta: la API ya lo impide.
 */
export function toContextSuggestion(
  suggestion: string,
  sources: ContextSourceView[],
  links: { slug: string; reason: string }[],
  contradictions: { slug: string; note: string }[],
): ContextSuggestion {
  const posts: ContextPost[] = [];
  for (const source of sources) {
    const post = posts.find((candidate) => candidate.postId === source.postId);
    if (post) {
      if (source.section !== '' && !post.sections.includes(source.section)) {
        post.sections.push(source.section);
      }
    } else {
      posts.push({ postId: source.postId, slug: source.slug, title: source.title, sections: source.section === '' ? [] : [source.section] });
    }
  }

  const bySlug = new Map(posts.map((post) => [post.slug, post]));

  return {
    suggestion,
    internalLinks: links.flatMap((link) => {
      const post = bySlug.get(link.slug);
      return post ? [{ postId: post.postId, title: post.title, reason: link.reason }] : [];
    }),
    contradictions: contradictions.flatMap((contradiction) => {
      const post = bySlug.get(contradiction.slug);
      return post ? [{ postId: post.postId, title: post.title, note: contradiction.note }] : [];
    }),
    posts,
  };
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
