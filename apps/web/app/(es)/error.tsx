'use client';

import { ErrorView } from '@/components/portfolio/error-view';
import { es } from '@/lib/content/es';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView text={es.ui.error} reset={reset} />;
}
