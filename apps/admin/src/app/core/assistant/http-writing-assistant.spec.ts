import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { HttpWritingAssistant, MAX_ASSISTANT_CONTENT, provideHttpWritingAssistant } from './http-writing-assistant';
import { AssistantError, DraftInput, WritingAssistant } from './writing-assistant';

const API = 'http://api.test';
const IMPROVE = `${API}/api/v1/admin/assistant/improve-writing`;
const METADATA = `${API}/api/v1/admin/assistant/suggest-metadata`;
const COVER = `${API}/api/v1/admin/assistant/suggest-cover`;
const CONTEXT = `${API}/api/v1/admin/assistant/improve-with-context`;
const RAG_STATUS = `${API}/api/v1/admin/rag/status`;
const draft: DraftInput = { title: 'Hola', content: '# Hola\n\nUn borrador.' };

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideHttpWritingAssistant(), { provide: API_BASE_URL, useValue: API }],
  });

  return { assistant: TestBed.inject(WritingAssistant), httpMock: TestBed.inject(HttpTestingController) };
}

/** El error con el que termina el observable; falla si emite un valor. */
async function failure(source: Observable<unknown>): Promise<unknown> {
  try {
    await firstValueFrom(source);
  } catch (error) {
    return error;
  }
  throw new Error('se esperaba un error');
}

describe('HttpWritingAssistant', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('es la implementación que se provee, con portada y con el aviso de Gemini', () => {
    const { assistant } = setup();

    expect(assistant).toBeInstanceOf(HttpWritingAssistant);
    expect(assistant.suggestsCover).toBe(true);
    expect(assistant.notice).toContain('Gemini');
  });

  it('mejora la redacción con POST y solo el título y el contenido', async () => {
    const { assistant, httpMock } = setup();
    const withExtra = { ...draft, excerpt: 'no debe viajar' } as DraftInput;

    const result = firstValueFrom(assistant.improveWriting(withExtra));
    const request = httpMock.expectOne({ method: 'POST', url: IMPROVE });
    expect(request.request.body).toEqual({ title: 'Hola', content: '# Hola\n\nUn borrador.' });
    request.flush({ content: '# Hola\n\nUn borrador mejor.' });

    expect(await result).toBe('# Hola\n\nUn borrador mejor.');
  });

  it('sugiere metadatos con POST', async () => {
    const { assistant, httpMock } = setup();

    const result = firstValueFrom(assistant.suggestMetadata(draft));
    const request = httpMock.expectOne({ method: 'POST', url: METADATA });
    expect(request.request.body).toEqual({ title: 'Hola', content: '# Hola\n\nUn borrador.' });
    request.flush({ title: 'Título', excerpt: 'Extracto', tags: ['ia'] });

    expect(await result).toEqual({ title: 'Título', excerpt: 'Extracto', tags: ['ia'] });
  });

  it('traduce el 503 según el detail y el 429 con Retry-After', async () => {
    const { assistant, httpMock } = setup();
    const respond = async (status: number, body: object, headers: Record<string, string> = {}) => {
      const result = failure(assistant.improveWriting(draft));
      httpMock.expectOne(IMPROVE).flush(body, { status, statusText: 'Error', headers });
      const error = await result;
      expect(error).toBeInstanceOf(AssistantError);

      return (error as AssistantError).message;
    };

    expect(await respond(503, { status: 503, detail: 'writing assistant is disabled' })).toBe('El asistente está desactivado en la API.');
    expect(await respond(503, { status: 503, detail: 'writing assistant is unavailable, try again later' })).toContain(
      'no está disponible ahora',
    );
    expect(await respond(503, { status: 503, detail: 'writing assistant returned an invalid suggestion, try again' })).toContain(
      'no cumple las reglas',
    );
    expect(await respond(429, { status: 429 }, { 'Retry-After': '45' })).toBe(
      'Pediste demasiadas sugerencias seguidas. Inténtalo de nuevo en 45 segundos.',
    );
    expect(await respond(500, { status: 500 })).toBe('Error inesperado del servidor. Inténtalo de nuevo.');
  });

  it('un error de red también sale como AssistantError', async () => {
    const { assistant, httpMock } = setup();

    const result = failure(assistant.suggestMetadata(draft));
    httpMock.expectOne(METADATA).error(new ProgressEvent('error'), { status: 0 });

    const error = await result;
    expect(error).toBeInstanceOf(AssistantError);
    expect((error as AssistantError).message).toContain('No se pudo conectar');
  });

  it('no envía un borrador vacío ni uno más largo que el contrato', async () => {
    const { assistant, httpMock } = setup();

    const empty = (await failure(assistant.improveWriting({ title: 'Hola', content: '  \n' }))) as AssistantError;
    expect(empty).toBeInstanceOf(AssistantError);
    expect(empty.message).toContain('Escribe algo de contenido');

    // Un emoji son dos unidades UTF-16 pero un carácter: el máximo justo pasa.
    const atLimit = firstValueFrom(assistant.improveWriting({ title: '', content: '😀'.repeat(MAX_ASSISTANT_CONTENT) }));
    httpMock.expectOne(IMPROVE).flush({ content: 'ok' });
    expect(await atLimit).toBe('ok');

    const tooLong = (await failure(assistant.suggestMetadata({ title: '', content: 'a'.repeat(MAX_ASSISTANT_CONTENT + 1) }))) as AssistantError;
    expect(tooLong.message).toContain('demasiado largo');
    httpMock.expectNone(METADATA);
  });

  it('sugiere la idea de portada con POST y solo el título y el contenido', async () => {
    const { assistant, httpMock } = setup();
    const withExtra = { ...draft, tags: ['no', 'viaja'] } as DraftInput;

    const result = firstValueFrom(assistant.suggestCover(withExtra));
    const request = httpMock.expectOne({ method: 'POST', url: COVER });
    expect(request.request.body).toEqual({ title: 'Hola', content: '# Hola\n\nUn borrador.' });
    request.flush({ subject: 'A conductor robot guiding small robots', alt: 'Un robot director coordina a otros robots.' });

    expect(await result).toEqual({
      description: 'A conductor robot guiding small robots',
      altText: 'Un robot director coordina a otros robots.',
    });
  });

  it('la idea de portada traduce el 503 de una salida inválida', async () => {
    const { assistant, httpMock } = setup();

    const result = failure(assistant.suggestCover(draft));
    httpMock
      .expectOne(COVER)
      .flush({ status: 503, detail: 'writing assistant returned an invalid suggestion, try again' }, { status: 503, statusText: 'Error' });

    const error = await result;
    expect(error).toBeInstanceOf(AssistantError);
    expect((error as AssistantError).message).toContain('no cumple las reglas');
  });

  it('la idea de portada no envía un borrador vacío', async () => {
    const { assistant, httpMock } = setup();

    const error = (await failure(assistant.suggestCover({ title: 'Hola', content: ' ' }))) as AssistantError;
    expect(error.message).toContain('Escribe algo de contenido');
    httpMock.expectNone(COVER);
  });

  describe('mejorar con mi contexto (ADR-027)', () => {
    it('está disponible si el estado del RAG dice enabled', async () => {
      const { assistant, httpMock } = setup();

      const enabled = firstValueFrom(assistant.contextAvailable());
      httpMock.expectOne({ method: 'GET', url: RAG_STATUS }).flush({ enabled: true, model: 'm', publishedPosts: 1, indexedPosts: 1, pendingPosts: 0, chunks: 2 });
      expect(await enabled).toBe(true);

      const disabled = firstValueFrom(assistant.contextAvailable());
      httpMock.expectOne(RAG_STATUS).flush({ enabled: false, model: '', publishedPosts: 0, indexedPosts: 0, pendingPosts: 0, chunks: 0 });
      expect(await disabled).toBe(false);
    });

    it('no está disponible si el estado falla', async () => {
      const { assistant, httpMock } = setup();

      const available = firstValueFrom(assistant.contextAvailable());
      httpMock.expectOne(RAG_STATUS).flush({ title: 'x' }, { status: 500, statusText: 'Error' });

      expect(await available).toBe(false);
    });

    it('envía título, contenido y el id del post, y agrupa el contexto por post', async () => {
      const { assistant, httpMock } = setup();

      const result = firstValueFrom(assistant.improveWithContext({ ...draft, postId: 'p9' }));
      const request = httpMock.expectOne({ method: 'POST', url: CONTEXT });
      expect(request.request.body).toEqual({ title: 'Hola', content: '# Hola\n\nUn borrador.', postId: 'p9' });
      request.flush({
        suggestion: '- Enlaza el post.',
        internalLinks: [{ slug: 'uno', reason: 'En la intro.' }],
        contradictions: [{ slug: 'dos', note: 'Dice lo contrario.' }],
        context: [
          { postId: 'p1', slug: 'uno', title: 'Uno', section: 'A', score: 0.9 },
          { postId: 'p2', slug: 'dos', title: 'Dos', section: '', score: 0.8 },
          { postId: 'p1', slug: 'uno', title: 'Uno', section: 'B', score: 0.7 },
          { postId: 'p1', slug: 'uno', title: 'Uno', section: 'A', score: 0.6 },
        ],
      });

      expect(await result).toEqual({
        suggestion: '- Enlaza el post.',
        internalLinks: [{ postId: 'p1', title: 'Uno', reason: 'En la intro.' }],
        contradictions: [{ postId: 'p2', title: 'Dos', note: 'Dice lo contrario.' }],
        posts: [
          { postId: 'p1', slug: 'uno', title: 'Uno', sections: ['A', 'B'] },
          { postId: 'p2', slug: 'dos', title: 'Dos', sections: [] },
        ],
      });
    });

    it('un post nuevo no envía postId', () => {
      const { assistant, httpMock } = setup();

      assistant.improveWithContext({ ...draft, postId: null }).subscribe();

      expect(httpMock.expectOne(CONTEXT).request.body).toEqual({ title: 'Hola', content: '# Hola\n\nUn borrador.' });
    });

    it('no envía un borrador vacío', async () => {
      const { assistant } = setup();

      const error = await failure(assistant.improveWithContext({ title: '', content: '  ', postId: null }));

      expect(error).toBeInstanceOf(AssistantError);
    });

    it('traduce el RAG apagado', async () => {
      const { assistant, httpMock } = setup();

      const error = failure(assistant.improveWithContext({ ...draft, postId: null }));
      httpMock.expectOne(CONTEXT).flush({ title: 'Service Unavailable', status: 503, detail: 'rag is disabled' }, { status: 503, statusText: 'Service Unavailable' });

      expect(((await error) as AssistantError).message).toBe('El contexto de tus posts está desactivado en la API (RAG_ENABLED=false).');
    });
  });
});
