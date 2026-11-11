import type { PublicComment } from './api';

/** Límites del contrato (CommentSubmission). */
export const COMMENT_LIMITS = { name: 50, content: 2000 } as const;

/**
 * Un trozo del texto de un comentario: texto plano o código en línea. Los
 * comentarios son solo texto (ADR-022, punto 2): los segmentos entre backticks
 * se muestran como código y nada más se interpreta. No hay Markdown, HTML ni
 * links: una URL queda como texto. React escapa cada trozo al renderizarlo.
 */
export type CommentSegment = { kind: 'text'; text: string } | { kind: 'code'; text: string };

/**
 * Parte el texto en texto plano y código en línea. Un backtick sin pareja
 * queda como texto, igual que un par vacío (``).
 */
export function commentSegments(content: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  const pattern = /`([^`\n]+)`/g;
  let last = 0;

  for (const match of content.matchAll(pattern)) {
    const start = match.index;
    if (start > last) {
      segments.push({ kind: 'text', text: content.slice(last, start) });
    }
    segments.push({ kind: 'code', text: match[1] ?? '' });
    last = start + match[0].length;
  }
  if (last < content.length) {
    segments.push({ kind: 'text', text: content.slice(last) });
  }

  return segments;
}

export interface CommentThread {
  comment: PublicComment;
  replies: PublicComment[];
}

/**
 * Agrupa los aprobados en hilos de un solo nivel (ADR-022, punto 1), en el
 * orden de la API (del más antiguo al más reciente). Una respuesta cuyo padre
 * no está en la lista (no aprobado o fuera de la página) no se muestra: sin su
 * contexto no se entiende, y si el padre se rechazó no debe asomar.
 */
export function commentThreads(comments: readonly PublicComment[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();
  for (const comment of comments) {
    if (!comment.parentId) {
      threads.set(comment.id, { comment, replies: [] });
    }
  }
  for (const comment of comments) {
    if (comment.parentId) {
      threads.get(comment.parentId)?.replies.push(comment);
    }
  }

  return [...threads.values()];
}

/** Lo que el formulario envía. `website` es el campo trampa. */
export interface CommentDraft {
  name: string;
  content: string;
  parentId?: string;
  website: string;
}

/** Resultado de un envío, ya traducido a un estado del formulario. */
export type SubmitResult =
  | { kind: 'pending' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Envía el comentario a la API (ADR-022, punto 3). La respuesta 202 siempre
 * dice «en revisión», también si el campo trampa estaba lleno: el formulario
 * no puede saber más, y no lo intenta.
 */
export async function submitComment(
  apiBaseUrl: string,
  slug: string,
  draft: CommentDraft,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<SubmitResult> {
  const body: Record<string, string> = { name: draft.name.trim(), content: draft.content.trim() };
  if (draft.parentId) {
    body['parentId'] = draft.parentId;
  }
  if (draft.website) {
    body['website'] = draft.website;
  }

  let response: Response;
  try {
    response = await fetchFn(`${apiBaseUrl}/api/v1/posts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      // Sin cookies: un lector no tiene sesión (ADR-022, punto 6).
      credentials: 'omit',
    });
  } catch {
    return { kind: 'error' };
  }

  switch (response.status) {
    case 202:
      return { kind: 'pending' };
    case 400:
    case 413:
      return { kind: 'invalid' };
    case 429: {
      const seconds = Number(response.headers.get('Retry-After'));
      return { kind: 'rate-limited', retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null };
    }
    case 404:
      return { kind: 'unavailable' };
    default:
      return { kind: 'error' };
  }
}

/** «unos minutos» o «unos 3 minutos», a partir de Retry-After. */
export function waitText(seconds: number | null): string {
  if (seconds === null) {
    return 'unos minutos';
  }
  const minutes = Math.ceil(seconds / 60);

  return minutes <= 1 ? 'un minuto' : `unos ${String(minutes)} minutos`;
}
