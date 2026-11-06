import { PostStatus } from '../../core/api/api-types';

/** Estados del contrato, en el orden en que se muestran. */
export const POST_STATUSES: readonly PostStatus[] = ['draft', 'published', 'archived'];

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

/** Fecha y hora en la zona horaria del navegador. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME.format(date);
}
