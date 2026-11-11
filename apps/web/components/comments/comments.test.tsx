import { ChakraProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PublicComment } from '@/lib/api';
import { contrastRatio, palette } from '@/lib/brand';

import { system } from '../theme/system';
import { CommentList } from './comment-list';
import { CommentsClient } from './comments-client';
import { CommentsSection } from './comments-section';
import { toneValues } from './tones';

function html(node: ReactNode): string {
  return renderToStaticMarkup(<ChakraProvider value={system}>{node}</ChakraProvider>);
}

/** Solo el marcado, sin las etiquetas <style> que Emotion inserta en el SSR. */
function markup(node: ReactNode): string {
  return html(node).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

function comment(id: string, fields: Partial<PublicComment> = {}): PublicComment {
  return { id, name: `Persona ${id}`, content: 'Hola', byAuthor: false, createdAt: '2026-11-01T12:00:00Z', ...fields };
}

describe('CommentList: solo texto (ADR-022, punto 2)', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[click](javascript:alert(1))',
    'https://spam.example/oferta',
    '"><svg onload=alert(1)>',
  ];

  it.each(attacks)('escapa %s y no crea etiquetas ni links', (content) => {
    const out = markup(<CommentList comments={[comment('a', { content, name: '<b>Mallory</b>' })]} />);

    expect(out).not.toMatch(/<script|<img|<svg onload|<a\s|<b>Mallory/);
    expect(out).toContain('&lt;b&gt;Mallory&lt;/b&gt;');
  });

  it('los backticks se muestran como <code>, también con HTML dentro', () => {
    const out = markup(<CommentList comments={[comment('a', { content: 'usa `<b>x</b>` así' })]} />);

    expect(out).toMatch(/<code[^>]*>&lt;b&gt;x&lt;\/b&gt;<\/code>/);
  });

  it('una respuesta anidada con la marca «Autor»', () => {
    const out = markup(
      <CommentList
        comments={[comment('a'), comment('r', { parentId: 'a', byAuthor: true, name: 'León', content: 'Gracias' })]}
      />,
    );

    expect(out.match(/<article/g)).toHaveLength(2);
    expect(out).toContain('Autor');
    // La respuesta va dentro del mismo <li> que su padre.
    expect(out.match(/<li/g)).toHaveLength(1);
  });

  it('sin comentarios: el estado vacío', () => {
    expect(markup(<CommentList comments={[]} />)).toContain('Sé la primera persona en comentar');
  });
});

describe('CommentsClient', () => {
  const out = markup(
    <CommentsClient apiBaseUrl="http://api.test" slug="mi-post">
      <p>lista</p>
    </CommentsClient>,
  );

  it('el campo trampa está oculto a lectores de pantalla y fuera del tab, sin display:none', () => {
    const trap = /<div[^>]*aria-hidden="true"[^>]*>(?:(?!<\/div>).)*name="website"[^>]*>/s.exec(out)?.[0] ?? '';
    const input = /<input[^>]*name="website"[^>]*>/.exec(trap)?.[0] ?? '';

    expect(input).not.toBe('');
    expect(input).toMatch(/tabindex="-1"/i);
    expect(input).toMatch(/autocomplete="off"/i);
    expect(input).not.toMatch(/\shidden|type="hidden"|display:\s*none/);
  });

  it('nombre y comentario son obligatorios, con los límites del contrato', () => {
    const name = /<input[^>]*name="name"[^>]*>/.exec(out)?.[0] ?? '';
    const content = /<textarea[^>]*name="content"[^>]*>/.exec(out)?.[0] ?? '';

    expect(name).toMatch(/required/);
    expect(name).toMatch(/maxLength="50"/i);
    expect(content).toMatch(/required/);
    expect(content).toMatch(/maxLength="2000"/i);
    expect(out).toMatch(/>0(?:<!-- -->)? \/ (?:<!-- -->)?2000/);
  });

  it('el aviso de IA y privacidad va antes del botón de enviar', () => {
    expect(out.indexOf('plan gratuito')).toBeGreaterThan(-1);
    expect(out.indexOf('plan gratuito')).toBeLessThan(out.indexOf('Enviar comentario'));
    expect(out).toContain('no incluyas datos personales');
  });

  it('la lista del servidor llega como children', () => {
    expect(out).toContain('<p>lista</p>');
  });
});

describe('CommentsSection', () => {
  it('con la API caída, la página sigue y lo dice', () => {
    const out = markup(<CommentsSection slug="mi-post" apiBaseUrl="http://api.test" comments={null} />);

    expect(out).toContain('No pudimos cargar los comentarios');
    expect(out).toContain('Enviar comentario');
  });

  it('el total de aprobados en el título', () => {
    const out = markup(
      <CommentsSection slug="mi-post" apiBaseUrl="http://api.test" comments={{ items: [comment('a')], total: 1, limit: 100, offset: 0 }} />,
    );

    expect(out).toMatch(/Comentarios[\s\S]*\(1\)/);
  });
});

describe('colores de los avisos (WCAG AA)', () => {
  it.each(Object.entries(toneValues))('%s: texto 4,5:1 e ícono 3:1 en claro y oscuro', (_, value) => {
    expect(contrastRatio(palette.light.fg, value.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.dark.fg, value.dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(value.light.icon, value.light.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(value.dark.icon, value.dark.bg)).toBeGreaterThanOrEqual(3);
  });
});
