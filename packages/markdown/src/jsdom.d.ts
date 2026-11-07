// Tipos mínimos de lo que usa server.ts, para no sumar @types/jsdom.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string });
    readonly window: Window & typeof globalThis;
  }
}
