import { describe, expect, it } from 'vitest';

import { createLimiter } from './concurrency';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLimiter', () => {
  it('nunca corre más tareas que el máximo y atiende en orden de llegada', async () => {
    const limit = createLimiter(4);
    const gates = Array.from({ length: 10 }, deferred);
    const started: number[] = [];
    let running = 0;
    let peak = 0;

    const all = gates.map((gate, index) =>
      limit(async () => {
        started.push(index);
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
        return index;
      }),
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);

    for (const gate of gates) {
      gate.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    await expect(Promise.all(all)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(4);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('libera el turno aunque la tarea falle', async () => {
    const limit = createLimiter(1);

    await expect(limit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limit(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('rechaza un máximo inválido', () => {
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(1.5)).toThrow();
  });
});
