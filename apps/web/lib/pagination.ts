/**
 * Paginación de /blog (BLOG-078). La página 1 es /blog y las demás
 * /blog/page/N: rutas estáticas con ISR, porque leer `?page=` (searchParams)
 * vuelve dinámica la página entera.
 */

/** Posts por página: lo que /blog mostraba antes de paginar. */
export const POSTS_PER_PAGE = 20;

/** `offset` máximo del contrato (parámetro Offset de la API pública). */
const MAX_OFFSET = 10_000;

/** La última página que la API puede servir con su `offset` máximo. */
export const MAX_PAGE = Math.floor(MAX_OFFSET / POSTS_PER_PAGE) + 1;

/** URL de una página: la 1 es /blog, sin duplicado en /blog/page/1. */
export function pageHref(page: number): string {
  return page <= 1 ? '/blog' : `/blog/page/${String(page)}`;
}

/** `offset` de la API para una página. */
export function pageOffset(page: number): number {
  return (page - 1) * POSTS_PER_PAGE;
}

export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
}

/**
 * El número de /blog/page/[n], o null si no es un entero en [1, MAX_PAGE]
 * escrito sin ceros a la izquierda (`02`, `1e1` o `2.0` no son URLs válidas).
 */
export function parsePageParam(value: string): number | null {
  if (!/^[1-9]\d{0,3}$/.test(value)) {
    return null;
  }
  const page = Number(value);

  return page <= MAX_PAGE ? page : null;
}

export type PaginationItem = { type: 'page'; page: number } | { type: 'gap'; key: string };

/**
 * Los números a mostrar: la primera, la última y las vecinas de la actual,
 * con un hueco (…) donde se saltan dos o más páginas. Un salto de una sola
 * página muestra el número, que ocupa lo mismo que el hueco.
 */
export function paginationItems(current: number, total: number): PaginationItem[] {
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous = 0;
  for (const page of pages) {
    if (page - previous === 2) {
      items.push({ type: 'page', page: previous + 1 });
    } else if (page - previous > 2) {
      items.push({ type: 'gap', key: `gap-${String(previous)}` });
    }
    items.push({ type: 'page', page });
    previous = page;
  }

  return items;
}
