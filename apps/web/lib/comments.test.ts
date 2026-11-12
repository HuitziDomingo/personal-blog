import { describe, expect, it } from 'vitest';

import type { PublicComment } from './api';
import { commentSegments, commentThreads, submitComment, waitText, type FetchLike } from './comments';

function comment(id: string, parentId?: string): PublicComment {
  return {
    id,
    name: id,
    content: `texto de ${id}`,
    byAuthor: false,
    createdAt: '2026-11-01T00:00:00Z',
    ...(parentId ? { parentId } : {}),
  };
}

describe('commentSegments (ADR-022, punto 2)', () => {
  it('texto sin backticks: un solo segmento', () => {
    expect(commentSegments('Hola')).toEqual([{ kind: 'text', text: 'Hola' }]);
  });

  it('los backticks marcan código en línea', () => {
    expect(commentSegments('Usa `.sort()` con `(a, b) => a - b`.')).toEqual([
      { kind: 'text', text: 'Usa ' },
      { kind: 'code', text: '.sort()' },
      { kind: 'text', text: ' con ' },
      { kind: 'code', text: '(a, b) => a - b' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('un backtick sin pareja o un par vacío quedan como texto', () => {
    expect(commentSegments('a ` b')).toEqual([{ kind: 'text', text: 'a ` b' }]);
    expect(commentSegments('a `` b')).toEqual([{ kind: 'text', text: 'a `` b' }]);
  });

  it('el código no cruza saltos de línea', () => {
    expect(commentSegments('`a\nb`')).toEqual([{ kind: 'text', text: '`a\nb`' }]);
  });

  it('HTML, Markdown y URLs se quedan como texto', () => {
    const content = '<script>alert(1)</script> [x](javascript:alert(1)) https://spam.example';
    expect(commentSegments(content)).toEqual([{ kind: 'text', text: content }]);
  });
});

describe('commentThreads', () => {
  it('un nivel de respuestas, en el orden de la API', () => {
    const threads = commentThreads([comment('a'), comment('b'), comment('r1', 'a'), comment('r2', 'a')]);

    expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['r1', 'r2']],
      ['b', []],
    ]);
  });

  it('una respuesta sin su padre en la lista no se muestra', () => {
    expect(commentThreads([comment('r', 'rechazado')])).toEqual([]);
  });
});

describe('submitComment', () => {
  function fakeFetch(response: Response | Error) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn: FetchLike = (url, init) => {
      calls.push({ url, init });
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    };
    return { fn, calls };
  }

  const draft = { name: ' Valeria ', content: ' Hola ', website: '' };

  it('envía JSON sin cookies y con los textos recortados', async () => {
    const { fn, calls } = fakeFetch(new Response(JSON.stringify({ status: 'pending' }), { status: 202 }));

    expect(await submitComment('http://api.test', 'mi-post', { ...draft, parentId: 'p1' }, fn)).toEqual({ kind: 'pending' });
    expect(calls[0]?.url).toBe('http://api.test/api/v1/posts/mi-post/comments');
    expect(calls[0]?.init.credentials).toBe('omit');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ name: 'Valeria', content: 'Hola', parentId: 'p1' });
  });

  it('el campo trampa viaja si tiene valor: la API lo descarta en silencio', async () => {
    const { fn, calls } = fakeFetch(new Response('{}', { status: 202 }));

    await submitComment('http://api.test', 'mi-post', { ...draft, website: 'https://spam.example' }, fn);
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({ website: 'https://spam.example' });
  });

  it.each([
    [400, { kind: 'invalid' }],
    [413, { kind: 'invalid' }],
    [404, { kind: 'unavailable' }],
    [500, { kind: 'error' }],
  ])('%i → %o', async (status, expected) => {
    const { fn } = fakeFetch(new Response('{}', { status }));
    expect(await submitComment('http://api.test', 'mi-post', draft, fn)).toEqual(expected);
  });

  it('429 con Retry-After', async () => {
    const { fn } = fakeFetch(new Response('{}', { status: 429, headers: { 'Retry-After': '200' } }));
    expect(await submitComment('http://api.test', 'mi-post', draft, fn)).toEqual({ kind: 'rate-limited', retryAfterSeconds: 200 });
  });

  it('un error de red es un error genérico', async () => {
    const { fn } = fakeFetch(new TypeError('Failed to fetch'));
    expect(await submitComment('http://api.test', 'mi-post', draft, fn)).toEqual({ kind: 'error' });
  });
});

it('waitText', () => {
  expect(waitText(null)).toBe('unos minutos');
  expect(waitText(30)).toBe('un minuto');
  expect(waitText(200)).toBe('unos 4 minutos');
});
