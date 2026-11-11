import type { Metadata } from 'next';

import { NotFoundView } from '@/components/not-found-view';
import { RootDocument, rootMetadata, rootViewport } from '@/components/root-document';
import { es } from '@/lib/content/es';

/**
 * 404 de las URLs que no coinciden con ninguna ruta. Con un layout raíz por
 * idioma (ADR-024, punto 2) no hay un layout común del que colgar el 404, así
 * que Next pide este archivo, que trae su propio `<html>`. Va en español, el
 * idioma por defecto (`x-default`).
 */
export const metadata: Metadata = { ...rootMetadata(es), title: 'No encontrado', robots: { index: false } };
export const viewport = rootViewport;

export default function GlobalNotFound() {
  return (
    <RootDocument content={es}>
      <NotFoundView />
    </RootDocument>
  );
}
