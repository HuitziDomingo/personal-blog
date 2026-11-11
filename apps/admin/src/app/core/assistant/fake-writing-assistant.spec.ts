import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import angularJson from '../../../../angular.json';
import { FAKE_ASSISTANT_DELAY_MS, FakeWritingAssistant, provideFakeWritingAssistant } from './fake-writing-assistant';
import { ASSISTANT_ENABLED, AssistantError, WritingAssistant } from './writing-assistant';

describe('FakeWritingAssistant', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    TestBed.configureTestingModule({
      providers: [provideFakeWritingAssistant(), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
  });

  it('es la implementación del puerto que se provee', () => {
    expect(TestBed.inject(WritingAssistant)).toBeInstanceOf(FakeWritingAssistant);
  });

  it('devuelve ejemplos fijos tras la espera, sin fetch ni HttpClient', async () => {
    const assistant = TestBed.inject(WritingAssistant);
    const draft = { title: 'Hola', content: 'Algo' };

    const content = firstValueFrom(assistant.improveWriting(draft));
    const metadata = firstValueFrom(assistant.suggestMetadata(draft));
    const cover = firstValueFrom(assistant.suggestCover(draft));
    await vi.advanceTimersByTimeAsync(FAKE_ASSISTANT_DELAY_MS);

    expect(await content).toContain('orquestador');
    expect((await metadata).tags).toEqual(['agentes', 'orquestacion', 'ia']);
    expect((await cover).altText).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
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
  const configurations = angularJson.projects.admin.architect.build.configurations;

  it('production lo apaga', () => {
    expect(configurations.production.define.ADMIN_ASSISTANT_ENABLED).toBe('false');
  });

  it('toma el valor del define de development (la configuración de los tests)', () => {
    expect(configurations.development.define.ADMIN_ASSISTANT_ENABLED).toBe('true');
    expect(TestBed.inject(ASSISTANT_ENABLED)).toBe(true);
  });
});
