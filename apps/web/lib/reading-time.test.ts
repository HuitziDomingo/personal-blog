import { describe, expect, it } from 'vitest';

import { formatReadingTime, readingMinutes, WORDS_PER_MINUTE } from './reading-time';

const words = (n: number) => Array.from({ length: n }, () => 'palabra').join(' ');

describe('readingMinutes', () => {
  it('is at least one minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('Hola')).toBe(1);
  });

  it('rounds words over the reading speed', () => {
    expect(readingMinutes(words(WORDS_PER_MINUTE * 3))).toBe(3);
    expect(readingMinutes(words(WORDS_PER_MINUTE * 3 + 120))).toBe(4);
  });

  it('ignores Markdown syntax and link URLs', () => {
    const md = '## Título\n\n> cita\n\n- uno\n\n[texto](https://example.com/una/url/larga) ![alt](/img.png)\n\n---';
    // Título, cita, uno, texto, alt.
    expect(readingMinutes(md)).toBe(1);
    expect(readingMinutes(`${md} ${words(WORDS_PER_MINUTE * 2 - 5)}`)).toBe(2);
  });

  it('counts the words inside code blocks', () => {
    expect(readingMinutes('```ts\n' + words(WORDS_PER_MINUTE * 2) + '\n```')).toBe(2);
  });
});

it('formats the reading time in Spanish', () => {
  expect(formatReadingTime(5)).toBe('5 min de lectura');
});
