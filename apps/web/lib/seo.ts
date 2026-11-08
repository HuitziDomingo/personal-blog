import type { Metadata } from 'next';

import { profile } from './site';

/** Imagen Open Graph por defecto (app/og.png/route.tsx), 1200 × 630. */
export const DEFAULT_OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: profile.name } as const;

export interface PageSeo {
  title: string;
  description: string;
  /** Ruta canónica, empezando por `/`. */
  path: string;
  type?: 'website' | 'article';
  image?: { url: string; alt: string };
  publishedTime?: string;
  modifiedTime?: string;
  tags?: readonly string[];
}

/**
 * Metadata completa de una página: canónica, Open Graph y Twitter. Next no
 * fusiona `openGraph` entre layout y página (la página lo reemplaza entero),
 * así que cada página la pide aquí. Las URLs relativas se resuelven con
 * `metadataBase` del layout.
 */
export function pageMetadata(seo: PageSeo): Metadata {
  const image = seo.image ?? DEFAULT_OG_IMAGE;
  const isArticle = seo.type === 'article';

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: seo.path,
      siteName: profile.shortName,
      locale: 'es_MX',
      images: [image],
      ...(isArticle
        ? {
            type: 'article',
            authors: [profile.name],
            ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}),
            ...(seo.modifiedTime ? { modifiedTime: seo.modifiedTime } : {}),
            ...(seo.tags ? { tags: [...seo.tags] } : {}),
          }
        : { type: 'website' }),
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: [image.url],
    },
  };
}

/**
 * La primera imagen del HTML ya sanitizado de un post, como URL absoluta, o
 * null. Se lee del HTML sanitizado, no del Markdown: así solo cuenta una URL
 * que la allowlist de packages/markdown aceptó.
 */
export function firstImage(html: string, siteUrl: string): { url: string; alt: string } | null {
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  if (!tag) {
    return null;
  }
  const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
  if (!src) {
    return null;
  }
  const alt = /\salt="([^"]*)"/i.exec(tag)?.[1] ?? '';

  try {
    return { url: new URL(decodeEntities(src), siteUrl).toString(), alt: decodeEntities(alt) };
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
