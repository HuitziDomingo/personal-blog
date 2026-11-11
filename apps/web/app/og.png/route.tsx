import type { ImageResponse } from 'next/og';

import { es } from '@/lib/content/es';
import { ogImage } from '@/lib/og-image';

// Se genera una vez en el build: no depende de la petición ni de la API.
export const dynamic = 'force-static';

/** Imagen Open Graph por defecto, en español. */
export function GET(): Promise<ImageResponse> {
  return ogImage(es.siteDescription);
}
