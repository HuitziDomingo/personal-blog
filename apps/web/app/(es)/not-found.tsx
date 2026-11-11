import type { Metadata } from 'next';

import { NotFoundView } from '@/components/not-found-view';

export const metadata: Metadata = { title: 'No encontrado', robots: { index: false } };

export default function NotFound() {
  return <NotFoundView />;
}
