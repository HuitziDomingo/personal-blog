import type { Metadata } from 'next';

import { profile } from './site';

/**
 * Feed RSS. Va en `alternates` de cada página porque Next no fusiona
 * `alternates` entre layout y página: la canónica de la página lo borraría.
 */
export const RSS_ALTERNATE = { 'application/rss+xml': [{ url: '/feed.xml', title: `Blog de ${profile.shortName}` }] };

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
    alternates: { canonical: seo.path, types: RSS_ALTERNATE },
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

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
}

/** Páginas fijas, trabajos y posts publicados, con URLs absolutas. */
export function sitemapEntries(
  site: string,
  workIds: readonly string[],
  posts: readonly { slug: string; updatedAt: string }[],
): SitemapEntry[] {
  const base = site.replace(/\/+$/, '');
  const lastPost = posts.map((post) => post.updatedAt).sort().at(-1);

  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/blog`, changeFrequency: 'daily', priority: 0.9, ...(lastPost ? { lastModified: lastPost } : {}) },
    { url: `${base}/works`, changeFrequency: 'yearly', priority: 0.6 },
    ...workIds.map((id) => ({ url: `${base}/works/${id}`, changeFrequency: 'yearly' as const, priority: 0.5 })),
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}

export interface RobotsConfig {
  rules: { userAgent: string; allow?: string; disallow?: string };
  sitemap?: string;
}

/**
 * Producción se indexa; los despliegues de preview de Vercel no, para que no
 * compitan con huitzi.xyz en los buscadores.
 */
export function robotsConfig(site: string, env: Readonly<Record<string, string | undefined>>): RobotsConfig {
  const vercelEnv = env['VERCEL_ENV'];
  if (vercelEnv !== undefined && vercelEnv !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${site.replace(/\/+$/, '')}/sitemap.xml` };
}
