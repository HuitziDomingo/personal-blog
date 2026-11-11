import type { ImageResponse } from 'next/og';

import { en } from '@/lib/content/en';
import { ogImage } from '@/lib/og-image';

// Se genera una vez en el build: no depende de la petición ni de la API.
export const dynamic = 'force-static';

/** Imagen Open Graph de las páginas en inglés. */
export function GET(): Promise<ImageResponse> {
  return ogImage(en.siteDescription);
}
