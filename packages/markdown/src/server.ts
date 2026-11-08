// La referencia lleva el shim de tipos de jsdom a quien compile este archivo
// desde otra app; un import no sirve para una declaración `declare module`.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ver arriba
/// <reference path="./jsdom.d.ts" />
import { JSDOM } from 'jsdom';

import type { NewTabPolicy } from './policy';
import { createRenderer, type MarkdownRenderer } from './renderer';

export { ALLOWED_ATTR, ALLOWED_TAGS, isExternalLink, isSafeUrl, type NewTabPolicy, type UrlAttribute } from './policy';
export type { MarkdownRenderer } from './renderer';

export interface ServerRendererOptions {
  /** URL pública del sitio, p. ej. `https://huitzi.xyz`: los links relativos solo se conservan si resuelven a su origen. */
  siteUrl: string;
  /** Qué links abren en otra pestaña; la web usa `external`. */
  newTab: NewTabPolicy;
}

/**
 * Variante de servidor (ADR-017): la misma allowlist, política de URLs y motor
 * que la del navegador, con DOMPurify sobre un DOM de jsdom. Crea el DOM una
 * vez: guarda el render y reúsalo. Un `siteUrl` inválido lanza al crearlo.
 *
 * En el servidor se importa esta entrada, nunca la raíz del paquete: la raíz lee
 * `window` al cargarse.
 */
export function createServerRenderer({ siteUrl, newTab }: ServerRendererOptions): MarkdownRenderer {
  const base = new URL(siteUrl).href;
  const { window } = new JSDOM('', { url: base });

  return createRenderer(window, () => base, newTab);
}
