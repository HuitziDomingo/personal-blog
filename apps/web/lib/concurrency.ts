/**
 * Limita cuántas tareas asíncronas corren a la vez. Las que sobran esperan en
 * orden de llegada. Sin dependencias: unas líneas bastan para el cliente de la
 * API (BLOG-104).
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createLimiter: max must be a positive integer, got ${String(max)}`);
  }

  let running = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    const next = waiting.shift();
    if (next) {
      // El turno pasa directo a la siguiente: `running` no cambia.
      next();
    } else {
      running--;
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running < max) {
      running++;
    } else {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }

    try {
      return await task();
    } finally {
      release();
    }
  };
}
