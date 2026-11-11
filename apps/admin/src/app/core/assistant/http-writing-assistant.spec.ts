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

  it('es la implementación que se provee, sin portada y con el aviso de Gemini', () => {
    const { assistant } = setup();

    expect(assistant).toBeInstanceOf(HttpWritingAssistant);
    expect(assistant.suggestsCover).toBe(false);
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

  it('la idea de portada falla sin petición', async () => {
    const { assistant } = setup();

    expect(await failure(assistant.suggestCover(draft))).toBeInstanceOf(AssistantError);
  });
});
