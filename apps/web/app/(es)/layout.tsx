import type { ReactNode } from 'react';

import { RootDocument, rootMetadata, rootViewport } from '@/components/root-document';
import { es } from '@/lib/content/es';

// Layout raíz del español: la raíz del sitio y el blog (ADR-024, punto 2).
export const metadata = rootMetadata(es);
export const viewport = rootViewport;

export default function SpanishLayout({ children }: { children: ReactNode }) {
  return <RootDocument content={es}>{children}</RootDocument>;
}
