import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';

import { Post } from '../../core/api/api-types';
import { createPostForm, formValueOf, isSlugEditable, POST_LIMITS, splitList, toPostWrite } from './post-form';

const post: Post = {
  id: 'p1',
  authorId: 'a1',
  title: 'Hola mundo',
  slug: 'hola-mundo',
  excerpt: 'Extracto',
  content: '# Hola',
  tags: ['go', 'ia'],
  status: 'draft',
  publishedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  seo: { title: 'SEO', keywords: ['a', 'b'], canonicalUrl: 'https://huitzi.xyz/hola' },
};

function form() {
  return createPostForm(TestBed.inject(NonNullableFormBuilder));
}

describe('post-form', () => {
  it('splitList separa por comas y descarta vacíos', () => {
    expect(splitList(' go, IA ,, agentes ,')).toEqual(['go', 'IA', 'agentes']);
    expect(splitList('')).toEqual([]);
  });

  it('exige título y contenido con algo más que espacios', () => {
    const f = form();
    f.patchValue({ title: '   ', content: ' \n ' });

    expect(f.controls.title.hasError('required')).toBe(true);
    expect(f.controls.content.hasError('required')).toBe(true);
  });

  it('aplica los límites del contrato', () => {
    const f = form();
    f.patchValue({
      title: 'x'.repeat(POST_LIMITS.title + 1),
      slug: 'x'.repeat(POST_LIMITS.slug + 1),
      excerpt: 'x'.repeat(POST_LIMITS.excerpt + 1),
      tags: Array.from({ length: POST_LIMITS.tags + 1 }, (_, i) => `t${i}`).join(','),
      seo: {
        title: 'x'.repeat(POST_LIMITS.seoTitle + 1),
        description: 'x'.repeat(POST_LIMITS.seoDescription + 1),
        keywords: 'x'.repeat(POST_LIMITS.keyword + 1),
        canonicalUrl: `https://huitzi.xyz/${'x'.repeat(POST_LIMITS.url)}`,
      },
    });

    expect(f.controls.title.hasError('maxlength')).toBe(true);
    expect(f.controls.slug.hasError('maxlength')).toBe(true);
    expect(f.controls.excerpt.hasError('maxlength')).toBe(true);
    expect(f.controls.tags.hasError('maxItems')).toBe(true);
    expect(f.controls.seo.controls.title.hasError('maxlength')).toBe(true);
    expect(f.controls.seo.controls.description.hasError('maxlength')).toBe(true);
    expect(f.controls.seo.controls.keywords.hasError('maxItemLength')).toBe(true);
    expect(f.controls.seo.controls.canonicalUrl.hasError('maxlength')).toBe(true);
  });

  it.each([
    ['hola-mundo', true],
    ['post-2', true],
    ['Hola', false],
    ['hola--mundo', false],
    ['-hola', false],
    ['canción', false],
  ])('valida el slug %s con el pattern del contrato', (slug, valid) => {
    const f = form();
    f.controls.slug.setValue(slug);

    expect(f.controls.slug.valid).toBe(valid);
  });

  it.each([
    ['', true],
    ['https://huitzi.xyz/post', true],
    ['http://localhost/x', true],
    ['javascript:alert(1)', false],
    ['data:image/png;base64,AAAA', false],
    ['huitzi.xyz/post', false],
  ])('acepta solo URLs http(s) absolutas: %s', (url, valid) => {
    const f = form();
    f.controls.seo.controls.ogImageUrl.setValue(url);

    expect(f.controls.seo.controls.ogImageUrl.valid).toBe(valid);
  });

  it('formValueOf y toPostWrite son inversas para un post completo', () => {
    const value = formValueOf(post);

    expect(value.tags).toBe('go, ia');
    expect(value.seo.keywords).toBe('a, b');
    expect(toPostWrite(value, 'draft', true)).toEqual({
      title: 'Hola mundo',
      slug: 'hola-mundo',
      excerpt: 'Extracto',
      content: '# Hola',
      tags: ['go', 'ia'],
      status: 'draft',
      seo: { title: 'SEO', keywords: ['a', 'b'], canonicalUrl: 'https://huitzi.xyz/hola' },
    });
  });

  it('toPostWrite omite el slug vacío o bloqueado y el SEO vacío, y no recorta el contenido', () => {
    const value = { ...formValueOf(post), title: '  Hola  ', content: '  código\n', seo: formValueOf({ ...post, seo: undefined }).seo };

    const empty = toPostWrite({ ...value, slug: '  ' }, 'published', true);
    expect(empty.slug).toBeUndefined();
    expect(empty.seo).toBeUndefined();
    expect(empty.title).toBe('Hola');
    expect(empty.content).toBe('  código\n');
    expect(empty.status).toBe('published');

    expect(toPostWrite({ ...value, slug: 'otro' }, 'draft', false).slug).toBeUndefined();
  });

  it('isSlugEditable: nuevo o borrador nunca publicado', () => {
    expect(isSlugEditable(null)).toBe(true);
    expect(isSlugEditable(post)).toBe(true);
    expect(isSlugEditable({ ...post, status: 'published', publishedAt: '2026-11-02T00:00:00Z' })).toBe(false);
    expect(isSlugEditable({ ...post, status: 'draft', publishedAt: '2026-11-02T00:00:00Z' })).toBe(false);
    expect(isSlugEditable({ ...post, status: 'archived' })).toBe(false);
  });
});
