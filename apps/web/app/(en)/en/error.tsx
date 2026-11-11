'use client';

import { ErrorView } from '@/components/portfolio/error-view';
import { en } from '@/lib/content/en';

export default function EnglishErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView text={en.ui.error} reset={reset} />;
}
