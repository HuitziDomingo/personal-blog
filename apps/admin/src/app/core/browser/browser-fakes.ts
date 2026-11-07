// Fakes de APIs del navegador para los tests (ADR-015). Solo los importan los
// .spec.ts, así que no llegan al bundle.

import { MatchMedia } from './match-media';

/** MediaQueryList controlable: `set()` cambia el valor y avisa a los listeners. */
export class FakeMediaQueryList extends EventTarget {
  constructor(
    readonly media: string,
    public matches: boolean,
  ) {
    super();
  }

  set(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(Object.assign(new Event('change'), { matches, media: this.media }));
  }

  listenerCount = 0;

  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.listenerCount++;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>): void {
    this.listenerCount--;
    super.removeEventListener(...args);
  }
}

/** matchMedia que devuelve siempre la misma lista por query, con el valor inicial dado. */
export class FakeMatchMedia {
  private readonly lists = new Map<string, FakeMediaQueryList>();

  constructor(private readonly initial: Readonly<Record<string, boolean>> = {}) {}

  readonly fn: MatchMedia = (query) => this.list(query) as unknown as MediaQueryList;

  list(query: string): FakeMediaQueryList {
    let list = this.lists.get(query);
    if (!list) {
      list = new FakeMediaQueryList(query, this.initial[query] ?? false);
      this.lists.set(query, list);
    }

    return list;
  }
}

/** Storage en memoria; con `failing`, lanza en cada acceso como un almacenamiento bloqueado. */
export class FakeStorage implements Storage {
  private readonly data = new Map<string, string>();
  failing = false;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.data.set(key, value);
    }
  }

  get length(): number {
    this.check();

    return this.data.size;
  }

  clear(): void {
    this.check();
    this.data.clear();
  }

  getItem(key: string): string | null {
    this.check();

    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    this.check();

    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.check();
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.check();
    this.data.set(key, value);
  }

  /** Lee sin pasar por `failing`, para las aserciones. */
  peek(key: string): string | undefined {
    return this.data.get(key);
  }

  private check(): void {
    if (this.failing) {
      throw new DOMException('Storage bloqueado', 'SecurityError');
    }
  }
}
