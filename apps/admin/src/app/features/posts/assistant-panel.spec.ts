import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { Observable, Subject, throwError } from 'rxjs';

import { AssistantError } from '../../core/assistant/fake-writing-assistant';
import { CoverIdea, DraftInput, MetadataSuggestion, WritingAssistant } from '../../core/assistant/writing-assistant';
import { AssistantPanel } from './assistant-panel';

/** Doble del puerto (ADR-015): cada petición responde cuando el test decide. */
class ControlledAssistant implements WritingAssistant {
  readonly drafts: DraftInput[] = [];
  improve = new Subject<string>();
  metadata = new Subject<MetadataSuggestion>();
  cover = new Subject<CoverIdea>();
  failWith: unknown = null;

  improveWriting(draft: DraftInput): Observable<string> {
    return this.track(draft, this.improve);
  }

  suggestMetadata(draft: DraftInput): Observable<MetadataSuggestion> {
    return this.track(draft, this.metadata);
  }

  suggestCover(draft: DraftInput): Observable<CoverIdea> {
    return this.track(draft, this.cover);
  }

  private track<T>(draft: DraftInput, subject: Subject<T>): Observable<T> {
    this.drafts.push(draft);
    return this.failWith === null ? subject.asObservable() : throwError(() => this.failWith);
  }
}

async function renderPanel(assistant = new ControlledAssistant()) {
  const applyContent = vi.fn();
  const applyMetadata = vi.fn();
  const result = await render(AssistantPanel, {
    inputs: { title: 'Hola', content: '# Hola' },
    on: { applyContent, applyMetadata },
    providers: [{ provide: WritingAssistant, useValue: assistant }, provideHttpClient(), provideHttpClientTesting()],
  });

  return { ...result, assistant, applyContent, applyMetadata };
}

describe('AssistantPanel', () => {
  it('muestra la carga, la sugerencia y la aplica', async () => {
    const { assistant, applyContent, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    expect(screen.getByRole('status').textContent).toContain('Pensando: Mejorar redacción');
    expect(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' }).hasAttribute('disabled')).toBe(true);
    expect(assistant.drafts).toEqual([{ title: 'Hola', content: '# Hola' }]);

    assistant.improve.next('## Mejor');
    fixture.detectChanges();
    expect(screen.getByRole('article', { name: 'Sugerencia' }).textContent).toContain('## Mejor');

    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(applyContent).toHaveBeenCalledWith('## Mejor');
    expect(screen.queryByRole('article', { name: 'Sugerencia' })).toBeNull();
  });

  it('aplica título, extracto y tags', async () => {
    const { assistant, applyMetadata, fixture } = await renderPanel();
    const metadata = { title: 'T', excerpt: 'E', tags: ['a', 'b'] };

    await fireEvent.click(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' }));
    assistant.metadata.next(metadata);
    fixture.detectChanges();
    expect(screen.getByText('a, b')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(applyMetadata).toHaveBeenCalledWith(metadata);
  });

  it('descartar no aplica nada', async () => {
    const { assistant, applyContent, applyMetadata, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Idea de imagen de portada' }));
    assistant.cover.next({ description: 'Robots', altText: 'Alt' });
    fixture.detectChanges();
    await fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByRole('article', { name: 'Sugerencia' })).toBeNull();
    expect(applyContent).not.toHaveBeenCalled();
    expect(applyMetadata).not.toHaveBeenCalled();
  });

  it('muestra el error del asistente y reintenta', async () => {
    const assistant = new ControlledAssistant();
    assistant.failWith = new AssistantError('Escribe algo de contenido antes de pedir una sugerencia.');
    const { fixture } = await renderPanel(assistant);

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    expect(screen.getByRole('alert').textContent).toContain('Escribe algo de contenido');

    assistant.failWith = null;
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    assistant.improve.next('Listo');
    fixture.detectChanges();
    expect(screen.getByRole('article', { name: 'Sugerencia' }).textContent).toContain('Listo');
  });

  it('un error inesperado se muestra con un mensaje genérico', async () => {
    const assistant = new ControlledAssistant();
    assistant.failWith = new Error('stack interno');
    await renderPanel(assistant);

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));

    expect(screen.getByRole('alert').textContent).toContain('El asistente no respondió.');
    expect(screen.getByRole('alert').textContent).not.toContain('stack interno');
  });

  it('no hace ninguna petición HTTP', async () => {
    const { assistant, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('x');
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).verify();
  });
});
