import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AssistantError, FAKE_ASSISTANT_DELAY_MS, FakeWritingAssistant } from './fake-writing-assistant';
import { ASSISTANT_ENABLED, WritingAssistant } from './writing-assistant';

describe('FakeWritingAssistant', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('es la implementación del puerto por defecto', () => {
    expect(TestBed.inject(WritingAssistant)).toBeInstanceOf(FakeWritingAssistant);
  });

  it('devuelve ejemplos fijos tras la espera, sin ninguna petición de red', async () => {
    const assistant = TestBed.inject(WritingAssistant);
    const draft = { title: 'Hola', content: 'Algo' };

    const content = firstValueFrom(assistant.improveWriting(draft));
    const metadata = firstValueFrom(assistant.suggestMetadata(draft));
    const cover = firstValueFrom(assistant.suggestCover(draft));
    await vi.advanceTimersByTimeAsync(FAKE_ASSISTANT_DELAY_MS);

    expect(await content).toContain('orquestador');
    expect((await metadata).tags).toEqual(['agentes', 'orquestacion', 'ia']);
    expect((await cover).altText).toBeTruthy();
    TestBed.inject(HttpTestingController).verify();
  });

  it('falla con un mensaje en español si el contenido está vacío', async () => {
    const result = firstValueFrom(TestBed.inject(WritingAssistant).improveWriting({ title: '', content: '   ' }));
    const assertion = expect(result).rejects.toBeInstanceOf(AssistantError);
    await vi.advanceTimersByTimeAsync(FAKE_ASSISTANT_DELAY_MS);

    await assertion;
  });
});

describe('ASSISTANT_ENABLED', () => {
  it('está encendido en development (la configuración de los tests)', () => {
    expect(TestBed.inject(ASSISTANT_ENABLED)).toBe(true);
  });
});
