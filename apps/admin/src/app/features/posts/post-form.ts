import { AbstractControl, NonNullableFormBuilder, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { Post, PostStatus, PostWrite } from '../../core/api/api-types';

/**
 * Límites de `PostWrite`, `Slug` y `Seo` en docs/api/openapi.yaml. El validador
 * de la API los aplica igual; aquí se adelantan para avisar en el campo.
 */
export const POST_LIMITS = {
  title: 200,
  slug: 80,
  excerpt: 500,
  tags: 20,
  tag: 50,
  seoTitle: 200,
  seoDescription: 300,
  keywords: 20,
  keyword: 50,
  url: 2048,
} as const;

/** El `pattern` de `Slug` en el contrato. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Separa una lista escrita con comas, sin elementos vacíos. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Requerido y con algo más que espacios: la API rechaza un título en blanco. */
export const notBlank: ValidatorFn = (control: AbstractControl<string>) =>
  control.value.trim() === '' ? { required: true } : null;

/** Lista separada por comas con un máximo de elementos y de largo por elemento. */
export function listValidator(maxItems: number, maxItemLength: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const items = splitList(control.value);
    if (items.length > maxItems) {
      return { maxItems: { max: maxItems, actual: items.length } };
    }
    if (items.some((item) => item.length > maxItemLength)) {
      return { maxItemLength: { max: maxItemLength } };
    }
    return null;
  };
}

/**
 * URL absoluta http o https. El contrato pide `format: uri`; se restringe a
 * http(s) porque son las únicas que tienen sentido como canónica o imagen.
 */
export const httpUrl: ValidatorFn = (control: AbstractControl<string>) => {
  const value = control.value.trim();
  if (value === '') {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { url: true };
  } catch {
    return { url: true };
  }
};

export function createPostForm(fb: NonNullableFormBuilder) {
  return fb.group({
    title: ['', [notBlank, Validators.maxLength(POST_LIMITS.title)]],
    slug: ['', [Validators.maxLength(POST_LIMITS.slug), Validators.pattern(SLUG_PATTERN)]],
    excerpt: ['', Validators.maxLength(POST_LIMITS.excerpt)],
    tags: ['', listValidator(POST_LIMITS.tags, POST_LIMITS.tag)],
    content: ['', notBlank],
    seo: fb.group({
      title: ['', Validators.maxLength(POST_LIMITS.seoTitle)],
      description: ['', Validators.maxLength(POST_LIMITS.seoDescription)],
      keywords: ['', listValidator(POST_LIMITS.keywords, POST_LIMITS.keyword)],
      canonicalUrl: ['', [httpUrl, Validators.maxLength(POST_LIMITS.url)]],
      ogImageUrl: ['', [httpUrl, Validators.maxLength(POST_LIMITS.url)]],
    }),
  });
}

export type PostForm = ReturnType<typeof createPostForm>;
export type PostFormValue = ReturnType<PostForm['getRawValue']>;

/** Valores del formulario para un post guardado. */
export function formValueOf(post: Post): PostFormValue {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    tags: post.tags.join(', '),
    content: post.content,
    seo: {
      title: post.seo?.title ?? '',
      description: post.seo?.description ?? '',
      keywords: (post.seo?.keywords ?? []).join(', '),
      canonicalUrl: post.seo?.canonicalUrl ?? '',
      ogImageUrl: post.seo?.ogImageUrl ?? '',
    },
  };
}

/**
 * Cuerpo de `POST` o `PUT`. El slug va solo si se puede cambiar y no está
 * vacío: vacío, la API lo genera al crear o conserva el actual al editar. Los
 * campos de SEO vacíos se omiten, porque una URL vacía no es un `uri` válido.
 */
export function toPostWrite(value: PostFormValue, status: PostStatus, slugEditable: boolean): PostWrite {
  const write: PostWrite = {
    title: value.title.trim(),
    content: value.content,
    status,
    excerpt: value.excerpt.trim(),
    tags: splitList(value.tags),
  };

  const slug = value.slug.trim();
  if (slugEditable && slug !== '') {
    write.slug = slug;
  }

  const seo: NonNullable<PostWrite['seo']> = {};
  const seoTitle = value.seo.title.trim();
  const description = value.seo.description.trim();
  const keywords = splitList(value.seo.keywords);
  const canonicalUrl = value.seo.canonicalUrl.trim();
  const ogImageUrl = value.seo.ogImageUrl.trim();
  if (seoTitle) seo.title = seoTitle;
  if (description) seo.description = description;
  if (keywords.length > 0) seo.keywords = keywords;
  if (canonicalUrl) seo.canonicalUrl = canonicalUrl;
  if (ogImageUrl) seo.ogImageUrl = ogImageUrl;
  if (Object.keys(seo).length > 0) {
    write.seo = seo;
  }

  return write;
}

/**
 * El slug solo cambia en un borrador que nunca se publicó (regla del service).
 * Un post nuevo siempre puede elegirlo.
 */
export function isSlugEditable(post: Post | null): boolean {
  return post === null || (post.status === 'draft' && !post.publishedAt);
}
