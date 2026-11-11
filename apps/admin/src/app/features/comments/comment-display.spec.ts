import { Moderation } from '../../core/api/api-types';
import { relativeTime, textSegments, verdictView } from './comment-display';

const moderation = (overrides: Partial<Moderation>): Moderation => ({
  verdict: 'approve',
  category: 'none',
  reason: 'ok',
  model: 'm',
  analyzedAt: '2026-11-11T10:00:00Z',
  ...overrides,
});

describe('verdictView', () => {
  it('sin análisis', () => {
    expect(verdictView(undefined)).toEqual({ tone: 'none', label: 'Sin análisis', humanReview: false });
  });

  it('aprobar, rechazar y revisar, con la categoría si la hay', () => {
    expect(verdictView(moderation({})).label).toBe('Sugiere aprobar');
    expect(verdictView(moderation({ verdict: 'reject', category: 'spam' }))).toEqual({
      tone: 'reject',
      label: 'Sugiere rechazar · spam',
      humanReview: false,
    });
    expect(verdictView(moderation({ verdict: 'review', category: 'off_topic' })).label).toBe('Revisión humana · fuera de tema');
  });

  it('prompt injection y datos personales siempre van a revisión humana, aunque el modelo diga aprobar', () => {
    for (const category of ['prompt_injection', 'personal_data'] as const) {
      const view = verdictView(moderation({ verdict: 'approve', category }));
      expect(view.tone).toBe('review');
      expect(view.humanReview).toBe(true);
      expect(view.label).toMatch(/^Revisión humana · /);
    }
  });
});

describe('textSegments', () => {
  it('separa el código en línea entre backticks', () => {
    expect(textSegments('Usa `.sort()` y `toSorted()`.')).toEqual([
      { text: 'Usa ', code: false },
      { text: '.sort()', code: true },
      { text: ' y ', code: false },
      { text: 'toSorted()', code: true },
      { text: '.', code: false },
    ]);
  });

  it('un backtick sin pareja, o HTML, queda como texto', () => {
    expect(textSegments('a ` b <b>c</b>')).toEqual([{ text: 'a ` b <b>c</b>', code: false }]);
  });

  it('sin texto, sin segmentos', () => {
    expect(textSegments('')).toEqual([]);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('dice hace cuánto', () => {
    expect(relativeTime('2026-11-11T11:59:30Z', now)).toBe('ahora');
    expect(relativeTime('2026-11-11T11:48:00Z', now)).toBe('hace 12 minutos');
    expect(relativeTime('2026-11-11T09:00:00Z', now)).toBe('hace 3 horas');
    expect(relativeTime('2026-11-10T12:00:00Z', now)).toBe('ayer');
  });

  it('una fecha inválida se devuelve tal cual', () => {
    expect(relativeTime('no es fecha', now)).toBe('no es fecha');
  });
});
