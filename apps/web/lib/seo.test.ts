import { describe, expect, it } from 'vitest';

import { DEFAULT_OG_IMAGE, firstImage, pageMetadata } from './seo';

const SITE = 'https://huitzi.xyz';

describe('firstImage', () => {
  it('returns null without images', () => {
    expect(firstImage('<p>Hola</p>', SITE)).toBeNull();
  });

  it('resolves a site-relative image against the site URL', () => {
    expect(firstImage('<p><img src="/img/blog/a.webp" alt="Portada"></p>', SITE)).toEqual({
      url: 'https://huitzi.xyz/img/blog/a.webp',
      alt: 'Portada',
    });
  });

  it('keeps absolute URLs and takes only the first image', () => {
    const html = '<img alt="Uno &amp; dos" src="https://cdn.example.com/a.png?x=1&amp;y=2"><img src="/b.png">';
    expect(firstImage(html, SITE)).toEqual({ url: 'https://cdn.example.com/a.png?x=1&y=2', alt: 'Uno & dos' });
  });

  it('accepts an image without alt', () => {
    expect(firstImage('<img src="/a.png">', SITE)).toEqual({ url: 'https://huitzi.xyz/a.png', alt: '' });
  });
});

describe('pageMetadata', () => {
  it('sets canonical, Open Graph and Twitter with the default image', () => {
    const meta = pageMetadata({ title: 'Blog', description: 'Posts', path: '/blog' });
    expect(meta.alternates?.canonical).toBe('/blog');
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
