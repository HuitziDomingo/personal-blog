import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PostSummary } from '@/lib/api';
import { es } from '@/lib/content/es';
import { GLASS } from '@/lib/glass';
import { works } from '@/lib/site';

import { PostBody } from './post-body';
import { PostCard } from './post-card';
import { CvView } from './portfolio/cv-view';
import { system } from './theme/system';
import { WorkCard } from './work-card';

function html(node: ReactNode): string {
  return renderToStaticMarkup(<ChakraProvider value={system}>{node}</ChakraProvider>);
}

const post: PostSummary = {
  id: 'p1',
  authorId: 'a1',
  title: 'Título',
  slug: 'titulo',
  tags: [],
  status: 'published',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

describe('vidrio selectivo (BLOG-149)', () => {
  it('lo llevan las cards de posts y de trabajos y el recuadro de descarga del CV', () => {
    const [work] = works;
    if (!work) throw new Error('sin trabajos');

    expect(html(<PostCard post={post} />)).toMatch(/<article class="[^"]*\bglass\b/);
    expect(html(<WorkCard work={{ ...work, images: [] }} text={es.works[work.id]} href="/works/x" />)).toMatch(/<article class="[^"]*\bglass\b/);
    expect(html(<CvView content={es} pdfUrl="https://storage.googleapis.com/b/cv/es/a.pdf" />)).toMatch(/class="[^"]*\bglass\b/);
  });

  it('no lo lleva el cuerpo del artículo, con sus bloques de código', () => {
    expect(html(<PostBody html="<p>Texto</p><pre><code>x</code></pre>" />)).not.toMatch(/class="[^"]*\bglass\b/);
  });

  it('pinta el filtro que mide el test de contraste, con superficie sólida de respaldo', () => {
    const css = system._config.globalCss ?? {};
    const filter = `blur(${String(GLASS.blur)}px) saturate(${String(GLASS.saturate)})`;

    for (const selector of ['.glass', '.dark .glass'] as const) {
      const rule = css[selector] as unknown as Record<string, Record<string, string>>;
      expect(rule['@media (prefers-reduced-transparency: reduce)']).toMatchObject({ backdropFilter: 'none', background: 'var(--chakra-colors-brand-surface)' });
      expect(rule['@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))']).toMatchObject({ background: 'var(--chakra-colors-brand-surface)' });
    }
    expect(css['.glass']).toMatchObject({ backdropFilter: filter });
  });
});
