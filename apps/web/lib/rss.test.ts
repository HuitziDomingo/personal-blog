import { describe, expect, it } from 'vitest';

import type { PostSummary } from './api';
import { buildRss } from './rss';

const channel = { title: 'Blog', description: 'Posts', siteUrl: 'https://huitzi.xyz/' };

function post(overrides: Partial<PostSummary>): PostSummary {
  return {
    id: '1',
    authorId: 'a',
    title: 'Título',
    slug: 'titulo',
    tags: [],
    status: 'published',
    publishedAt: '2026-11-01T12:00:00Z',
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
    ...overrides,
  };
}

describe('buildRss', () => {
  it('lists published posts with absolute links, dates, excerpt and tags', () => {
    const xml = buildRss(channel, [post({ excerpt: 'Resumen', tags: ['go', 'ia'] })]);
    expect(xml).toContain('<link>https://huitzi.xyz/blog/titulo</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://huitzi.xyz/blog/titulo</guid>');
    expect(xml).toContain('<pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate>');
    expect(xml).toContain('<description>Resumen</description>');
    expect(xml).toContain('<category>go</category>');
    expect(xml).toContain('<category>ia</category>');
    expect(xml).toContain('<atom:link href="https://huitzi.xyz/feed.xml"');
  });

  it('escapes XML in titles and excerpts', () => {
    const xml = buildRss(channel, [post({ title: 'A & B <c>', excerpt: '"x" \'y\'' })]);
    expect(xml).toContain('<title>A &amp; B &lt;c&gt;</title>');
    expect(xml).toContain('<description>&quot;x&quot; &apos;y&apos;</description>');
  });

  it('skips posts that are not published', () => {
    const xml = buildRss(channel, [post({ status: 'draft', publishedAt: null })]);
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('lastBuildDate');
  });
});
