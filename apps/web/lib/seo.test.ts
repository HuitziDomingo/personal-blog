import { describe, expect, it } from 'vitest';

import { coverImage, DEFAULT_OG_IMAGE, EN_OG_IMAGE, hreflang, pageMetadata, robotsConfig, RSS_ALTERNATE, sitemapEntries } from './seo';

const SITE = 'https://huitzi.xyz';

describe('coverImage', () => {
  it('returns null without a cover', () => {
    expect(coverImage(null, SITE)).toBeNull();
  });

  it('resolves a site-relative cover against the site URL', () => {
    expect(coverImage({ src: '/img/blog/a.webp', alt: 'Portada' }, SITE)).toEqual({
      url: 'https://huitzi.xyz/img/blog/a.webp',
      alt: 'Portada',
    });
  });

  it('keeps absolute URLs', () => {
    expect(coverImage({ src: 'https://cdn.example.com/a.png?x=1&y=2', alt: '' }, SITE)).toEqual({
      url: 'https://cdn.example.com/a.png?x=1&y=2',
      alt: '',
    });
  });
});

describe('pageMetadata', () => {
  it('sets canonical, Open Graph and Twitter with the default image', () => {
    const meta = pageMetadata({ title: 'Blog', description: 'Posts', path: '/blog' });
    expect(meta.alternates?.canonical).toBe('/blog');
    expect(meta.alternates?.types).toEqual(RSS_ALTERNATE);
    expect(meta.openGraph).toMatchObject({ url: '/blog', type: 'website', images: [DEFAULT_OG_IMAGE] });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [DEFAULT_OG_IMAGE.url] });
  });

  it('describes an article with its own image, dates and tags', () => {
    const meta = pageMetadata({
      title: 'Post',
      description: 'Resumen',
      path: '/blog/post',
      type: 'article',
      image: { url: 'https://huitzi.xyz/img/a.webp', alt: 'A' },
      publishedTime: '2026-11-01T00:00:00Z',
      tags: ['go'],
    });
    expect(meta.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-11-01T00:00:00Z',
      tags: ['go'],
      images: [{ url: 'https://huitzi.xyz/img/a.webp', alt: 'A' }],
    });
    expect(meta.twitter).toMatchObject({ images: ['https://huitzi.xyz/img/a.webp'] });
  });
});

describe('hreflang', () => {
  it('lists both languages and x-default in Spanish for a portfolio page', () => {
    expect(hreflang({ path: '/en/works', locale: 'en', languages: { es: '/works', en: '/en/works' } })).toEqual({
      es: '/works',
      en: '/en/works',
      'x-default': '/works',
    });
  });

  it('declares only Spanish for a page that exists only in Spanish', () => {
    expect(hreflang({ path: '/blog' })).toEqual({ es: '/blog', 'x-default': '/blog' });
  });
});

describe('pageMetadata by language', () => {
  it('uses the English Open Graph locale and image for an English page', () => {
    const meta = pageMetadata({
      title: 'Works',
      description: 'd',
      path: '/en/works',
      locale: 'en',
      ogLocale: 'en_US',
      languages: { es: '/works', en: '/en/works' },
    });
    expect(meta.alternates?.canonical).toBe('/en/works');
    expect(meta.alternates?.languages).toEqual({ es: '/works', en: '/en/works', 'x-default': '/works' });
    expect(meta.openGraph).toMatchObject({ locale: 'en_US', images: [EN_OG_IMAGE] });
  });
});

describe('sitemapEntries', () => {
  it('lists the comment rules only when a path is given, outside /blog', () => {
    expect(sitemapEntries(SITE, [], []).some((entry) => entry.url.includes('comentarios'))).toBe(false);
    const entries = sitemapEntries(SITE, [], [], '/comentarios/reglas');
    expect(entries.at(-1)?.url).toBe('https://huitzi.xyz/comentarios/reglas');
  });

  it('lists the portfolio in both languages, the blog and its posts', () => {
    const entries = sitemapEntries('https://huitzi.xyz/', ['debred'], [
      { slug: 'b', updatedAt: '2026-11-02T00:00:00Z' },
      { slug: 'a', updatedAt: '2026-11-05T00:00:00Z' },
    ]);
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://huitzi.xyz/',
      'https://huitzi.xyz/en',
      'https://huitzi.xyz/blog',
      'https://huitzi.xyz/works',
      'https://huitzi.xyz/en/works',
      'https://huitzi.xyz/works/debred',
      'https://huitzi.xyz/en/works/debred',
      'https://huitzi.xyz/blog/b',
      'https://huitzi.xyz/blog/a',
    ]);
    const blog = entries.find((entry) => entry.url === 'https://huitzi.xyz/blog');
    expect(blog?.lastModified).toBe('2026-11-05T00:00:00Z');
    expect(blog).not.toHaveProperty('alternates');
    expect(entries.at(-1)?.lastModified).toBe('2026-11-05T00:00:00Z');
  });

  it('gives each portfolio page its alternates, with x-default in Spanish', () => {
    const entries = sitemapEntries(SITE, ['debred'], []);
    const languages = {
      es: 'https://huitzi.xyz/works/debred',
      en: 'https://huitzi.xyz/en/works/debred',
      'x-default': 'https://huitzi.xyz/works/debred',
    };
    expect(entries.find((entry) => entry.url === languages.es)?.alternates).toEqual({ languages });
    expect(entries.find((entry) => entry.url === languages.en)?.alternates).toEqual({ languages });
    expect(entries[0]?.alternates?.languages).toEqual({
      es: 'https://huitzi.xyz/',
      en: 'https://huitzi.xyz/en',
      'x-default': 'https://huitzi.xyz/',
    });
  });

  it('omits the blog date without posts', () => {
    const blog = sitemapEntries(SITE, [], []).find((entry) => entry.url === `${SITE}/blog`);
    expect(blog).not.toHaveProperty('lastModified');
  });
});

describe('robotsConfig', () => {
  it('allows crawling and points to the sitemap in production and locally', () => {
    const expected = { rules: { userAgent: '*', allow: '/' }, sitemap: 'https://huitzi.xyz/sitemap.xml' };
    expect(robotsConfig(SITE, { VERCEL_ENV: 'production' })).toEqual(expected);
    expect(robotsConfig(SITE, {})).toEqual(expected);
  });

  it('blocks crawling of Vercel previews', () => {
    expect(robotsConfig(SITE, { VERCEL_ENV: 'preview' })).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
