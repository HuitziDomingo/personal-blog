import { describe, expect, it } from 'vitest';

import {
  MAX_PAGE,
  pageHref,
  pageOffset,
  paginationItems,
  parsePageParam,
  POSTS_PER_PAGE,
  totalPages,
} from './pagination';

const shown = (current: number, total: number) =>
  paginationItems(current, total)
    .map((item) => (item.type === 'page' ? String(item.page) : '…'))
    .join(' ');

describe('pageHref', () => {
  it('la página 1 es /blog, sin duplicado', () => {
    expect(pageHref(1)).toBe('/blog');
    expect(pageHref(2)).toBe('/blog/page/2');
  });
});

describe('pageOffset y totalPages', () => {
  it('convierten entre páginas y el offset de la API', () => {
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(3)).toBe(2 * POSTS_PER_PAGE);
    expect(totalPages(0)).toBe(1);
    expect(totalPages(20)).toBe(1);
    expect(totalPages(21)).toBe(2);
    expect(totalPages(27)).toBe(2);
  });

  it('la última página cabe en el offset máximo del contrato', () => {
    expect(pageOffset(MAX_PAGE)).toBeLessThanOrEqual(10_000);
    expect(pageOffset(MAX_PAGE + 1)).toBeGreaterThan(10_000);
  });
});

describe('parsePageParam', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    [String(MAX_PAGE), MAX_PAGE],
  ])('acepta %s', (value, page) => {
    expect(parsePageParam(value)).toBe(page);
  });

  it.each(['0', '-1', '02', '2.0', '1e1', ' 2', 'dos', '', String(MAX_PAGE + 1), '99999'])('rechaza «%s»', (value) => {
    expect(parsePageParam(value)).toBeNull();
  });
});

describe('paginationItems', () => {
  it('muestra todas cuando son pocas', () => {
    expect(shown(1, 1)).toBe('1');
    expect(shown(1, 2)).toBe('1 2');
    expect(shown(2, 5)).toBe('1 2 3 4 5');
  });

  it('pone un hueco solo donde se saltan dos o más páginas', () => {
    expect(shown(1, 10)).toBe('1 2 … 10');
    expect(shown(5, 10)).toBe('1 … 4 5 6 … 10');
    expect(shown(10, 10)).toBe('1 … 9 10');
    expect(shown(4, 10)).toBe('1 2 3 4 5 … 10');
  });
});
