import type { ReactNode } from 'react';

import { RootDocument, rootMetadata, rootViewport } from '@/components/root-document';
import { en } from '@/lib/content/en';

// Layout raíz del inglés: todo lo que cuelga de /en (ADR-024, punto 2).
export const metadata = rootMetadata(en);
export const viewport = rootViewport;

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <RootDocument content={en}>{children}</RootDocument>;
}
