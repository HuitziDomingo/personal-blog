import type { PostSummary } from './api';

export interface FeedChannel {
  title: string;
  description: string;
  siteUrl: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS 2.0 de los posts publicados, el más reciente primero. */
export function buildRss(channel: FeedChannel, posts: readonly PostSummary[]): string {
  const site = channel.siteUrl.replace(/\/+$/, '');
  const published = posts.filter((post) => post.status === 'published' && post.publishedAt);
  const lastBuild = published[0]?.publishedAt;

  const items = published.map((post) => {
    const link = `${site}/blog/${post.slug}`;

    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <pubDate>${new Date(post.publishedAt ?? '').toUTCString()}</pubDate>`,
      ...(post.excerpt ? [`      <description>${escapeXml(post.excerpt)}</description>`] : []),
      ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      '    </item>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(`${site}/blog`)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    '    <language>es-MX</language>',
    `    <atom:link href="${escapeXml(`${site}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...(lastBuild ? [`    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
