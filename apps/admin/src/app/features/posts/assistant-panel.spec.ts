import { Component, signal } from '@angular/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { Observable, Subject, throwError } from 'rxjs';

import { AssistantError, CoverIdea, DraftInput, MetadataSuggestion, WritingAssistant } from '../../core/assistant/writing-assistant';
import { AssistantPanel } from './assistant-panel';

/** Doble del puerto: cada petición responde cuando el test decide. */
class ControlledAssistant implements WritingAssistant {
  suggestsCover = true;
  readonly notice = 'Aviso de prueba.';
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

/** Anfitrión que hace de formulario: el contenido cambia con lo que aplica el panel. */
@Component({
  imports: [AssistantPanel],
  template: `<app-assistant-panel
    title="Hola"
    [content]="content()"
    [disabled]="saving()"
    (applyContent)="content.set($event)"
    (applyMetadata)="metadata = $event"
  />`,
})
class Host {
  readonly content = signal('# Hola');
  readonly saving = signal(false);
  metadata: MetadataSuggestion | null = null;
}

async function renderPanel(assistant = new ControlledAssistant()) {
  const result = await render(Host, { providers: [{ provide: WritingAssistant, useValue: assistant }] });

  return { ...result, assistant, host: result.fixture.componentInstance };
}

const status = () => screen.getByTestId('assistant-announcement');

describe('AssistantPanel', () => {
  it('muestra el aviso de la implementación y la portada si la ofrece', async () => {
    await renderPanel();

    expect(screen.getByTestId('assistant-notice').textContent?.trim()).toBe('Aviso de prueba.');
    expect(screen.getByRole('button', { name: 'Idea de imagen de portada' })).toBeTruthy();
  });

  it('oculta la portada si la implementación no la ofrece (ADR-021)', async () => {
    const withoutCover = new ControlledAssistant();
    withoutCover.suggestsCover = false;
    await renderPanel(withoutCover);

    expect(screen.queryByRole('button', { name: 'Idea de imagen de portada' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mejorar redacción' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' })).toBeTruthy();
  });

  it('muestra la carga, enfoca la sugerencia y al aplicar devuelve el foco', async () => {
    const { assistant, host, fixture } = await renderPanel();
    const improve = screen.getByRole('button', { name: 'Mejorar redacción' });

    await fireEvent.click(improve);
    expect(status().textContent).toContain('Pensando: Mejorar redacción');
    expect(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' }).hasAttribute('disabled')).toBe(true);
    expect(assistant.drafts).toEqual([{ title: 'Hola', content: '# Hola' }]);

    assistant.improve.next('## Mejor');
    fixture.detectChanges();
    const card = screen.getByRole('article', { name: 'Redacción sugerida' });
    await waitFor(() => expect(document.activeElement).toBe(card));

    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(host.content()).toBe('## Mejor');
    expect(status().textContent?.trim()).toBe('Redacción aplicada.');
    await waitFor(() => expect(document.activeElement).toBe(improve));
  });

  it('deshace la redacción aplicada, pero no después de editarla', async () => {
    const { assistant, host, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Mejor');
    fixture.detectChanges();
    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(host.content()).toBe('# Hola');
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mejorar redacción' })));

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Otra');
    fixture.detectChanges();
    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    host.content.set('## Otra, editada a mano');
    fixture.detectChanges();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('aplica título, extracto y tags', async () => {
    const { assistant, host, fixture } = await renderPanel();
    const metadata = { title: 'T', excerpt: 'E', tags: ['a', 'b'] };

    await fireEvent.click(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' }));
    assistant.metadata.next(metadata);
    fixture.detectChanges();
    expect(screen.getByText('a, b')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(host.metadata).toEqual(metadata);
  });

  describe('idea de portada', () => {
    afterEach(() => vi.unstubAllGlobals());

    async function showCover() {
      const panel = await renderPanel();
      await fireEvent.click(screen.getByRole('button', { name: 'Idea de imagen de portada' }));
      panel.assistant.cover.next({ description: 'Robots', altText: 'Alt' });
      panel.fixture.detectChanges();
      return panel;
    }

    it('se copia al portapapeles', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as Navigator, { clipboard: { writeText } }));
      await showCover();

      await fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

      expect(writeText).toHaveBeenCalledWith('Robots\n\nAlt: Alt');
      await waitFor(() => expect(status().textContent?.trim()).toBe('Idea copiada al portapapeles.'));
      expect(screen.queryByRole('article')).toBeNull();
    });

    it('si no se puede copiar, lo dice y deja la idea en pantalla', async () => {
      vi.stubGlobal(
        'navigator',
        Object.assign(Object.create(navigator) as Navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }),
      );
      await showCover();

      await fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

      await waitFor(() => expect(status().textContent).toContain('No se pudo copiar'));
      expect(screen.getByText('Robots')).toBeTruthy();
    });
  });

  it('descartar no aplica nada', async () => {
    const { assistant, host, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Mejor');
    fixture.detectChanges();
    await fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByRole('article')).toBeNull();
    expect(host.content()).toBe('# Hola');
  });

  it('mientras el editor guarda, nada del panel se puede usar', async () => {
    const { assistant, host, fixture } = await renderPanel();
    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Mejor');
    host.saving.set(true);
    fixture.detectChanges();

    for (const name of ['Mejorar redacción', 'Aplicar', 'Descartar']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('muestra el error del asistente y reintenta', async () => {
    const assistant = new ControlledAssistant();
    assistant.failWith = new AssistantError('Escribe algo de contenido antes de pedir una sugerencia.');
    const { fixture } = await renderPanel(assistant);

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    expect(screen.getByRole('alert').textContent).toContain('Escribe algo de contenido');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reintentar' })));

    assistant.failWith = null;
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    assistant.improve.next('Listo');
    fixture.detectChanges();
    expect(screen.getByRole('article', { name: 'Redacción sugerida' }).textContent).toContain('Listo');
  });

  it('un error inesperado se muestra con un mensaje genérico', async () => {
    const assistant = new ControlledAssistant();
    assistant.failWith = new Error('stack interno');
    await renderPanel(assistant);

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));

    expect(screen.getByRole('alert').textContent).toContain('El asistente no respondió.');
    expect(screen.getByRole('alert').textContent).not.toContain('stack interno');
  });
});
