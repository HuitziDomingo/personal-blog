import { CommentStatus, Moderation, ModerationCategory } from '../../core/api/api-types';

/** Pestañas de la cola, en el orden en que se muestran. */
export const COMMENT_STATUSES: readonly CommentStatus[] = ['pending', 'approved', 'rejected'];

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  pending: 'Pendientes',
  approved: 'Aprobados',
  rejected: 'Rechazados',
};

const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  none: 'sin problemas',
  spam: 'spam',
  abuse: 'abuso',
  off_topic: 'fuera de tema',
  prompt_injection: 'posible prompt injection',
  personal_data: 'datos personales',
};

/**
 * Categorías que siempre van a revisión humana, diga lo que diga el veredicto
 * (ADR-022, punto 5).
 */
const HUMAN_REVIEW: readonly ModerationCategory[] = ['prompt_injection', 'personal_data'];

export type VerdictTone = 'approve' | 'reject' | 'review' | 'none';

export interface VerdictView {
  tone: VerdictTone;
  label: string;
  /** El comentario se resalta: el modelo no debe decidir por sí solo. */
  humanReview: boolean;
}

/** Cómo se muestra la sugerencia del modelo. Sin análisis, «Sin análisis». */
export function verdictView(moderation: Moderation | undefined): VerdictView {
  if (!moderation) {
    return { tone: 'none', label: 'Sin análisis', humanReview: false };
  }

  const { verdict, category } = moderation;
  if (HUMAN_REVIEW.includes(category)) {
    return { tone: 'review', label: `Revisión humana · ${CATEGORY_LABELS[category]}`, humanReview: true };
  }

  const suffix = category === 'none' ? '' : ` · ${CATEGORY_LABELS[category]}`;
  switch (verdict) {
    case 'approve':
      return { tone: 'approve', label: `Sugiere aprobar${suffix}`, humanReview: false };
    case 'reject':
      return { tone: 'reject', label: `Sugiere rechazar${suffix}`, humanReview: false };
    default:
      return { tone: 'review', label: `Revisión humana${suffix}`, humanReview: false };
  }
}

export interface TextSegment {
  text: string;
  code: boolean;
}

/**
 * Parte el texto en trozos de texto y de código en línea (entre backticks),
 * como lo muestra la web (ADR-022, punto 2). Solo se interpola como texto:
 * nunca se interpreta HTML ni Markdown, y un backtick sin pareja queda tal cual.
 */
export function textSegments(content: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(/`([^`\n]+)`/g)) {
    if (match.index > last) {
      segments.push({ text: content.slice(last, match.index), code: false });
    }
    segments.push({ text: match[1], code: true });
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    segments.push({ text: content.slice(last), code: false });
  }
  return segments;
}

const RELATIVE = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** «hace 12 minutos», «ayer»… Menos de un minuto es «ahora». Una fecha inválida se devuelve tal cual. */
export function relativeTime(value: string, now: number = Date.now()): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return value;
  }

  const seconds = Math.round((time - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return RELATIVE.format(Math.trunc(seconds / size), unit);
    }
  }
  return 'ahora';
}
