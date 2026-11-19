import { Component, signal } from '@angular/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';

import {
  AssistantError,
  ContextDraftInput,
  ContextSuggestion,
  CoverIdea,
  DraftInput,
  MetadataSuggestion,
  WritingAssistant,
} from '../../core/assistant/writing-assistant';
import { AssistantPanel } from './assistant-panel';

/** Doble del puerto: cada petición responde cuando el test decide. */
class ControlledAssistant implements WritingAssistant {
  suggestsCover = true;
  readonly notice = 'Aviso de prueba.';
  readonly drafts: DraftInput[] = [];
  improve = new Subject<string>();
  metadata = new Subject<MetadataSuggestion>();
  cover = new Subject<CoverIdea>();
  context = new Subject<ContextSuggestion>();
  /** Lo que responde el estado del RAG; false hasta que el test lo cambie. */
  readonly ragEnabled = new BehaviorSubject(false);
  readonly contextDrafts: ContextDraftInput[] = [];
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

  contextAvailable(): Observable<boolean> {
    return this.ragEnabled.asObservable();
  }

  improveWithContext(draft: ContextDraftInput): Observable<ContextSuggestion> {
    this.contextDrafts.push(draft);
    return this.track(draft, this.context);
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
    [postId]="postId()"
    [disabled]="saving()"
    (applyContent)="content.set($event)"
    (applyMetadata)="metadata = $event"
  />`,
})
class Host {
  readonly content = signal('# Hola');
  readonly saving = signal(false);
  readonly postId = signal<string | null>('post-9');
  metadata: MetadataSuggestion | null = null;
}

async function renderPanel(assistant = new ControlledAssistant()) {
  const result = await render(Host, { providers: [provideRouter([]), { provide: WritingAssistant, useValue: assistant }] });

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

  it('muestra la redacción renderizada y sanitizada, y alterna con su Markdown', async () => {
    const { assistant, fixture } = await renderPanel();
    const markdown = '## Mejor\n\nTexto con **énfasis**.\n\n<script>alert(1)</script><img src="x" onerror="alert(1)">';

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next(markdown);
    fixture.detectChanges();

    const preview = screen.getByTestId('suggestion-preview');
    expect(preview.querySelector('h2')?.textContent).toBe('Mejor');
    expect(preview.querySelector('strong')?.textContent).toBe('énfasis');
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.innerHTML).not.toContain('onerror');
    expect(preview.innerHTML).not.toContain('alert(1)');

    await fireEvent.click(screen.getByRole('button', { name: 'Ver Markdown' }));
    expect(screen.queryByTestId('suggestion-preview')).toBeNull();
    expect(screen.getByText(/## Mejor/).tagName).toBe('PRE');

    await fireEvent.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(screen.getByTestId('suggestion-preview')).toBeTruthy();
  });

  it('cada sugerencia nueva empieza en la vista previa', async () => {
    const { assistant, fixture } = await renderPanel();

    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Uno');
    fixture.detectChanges();
    await fireEvent.click(screen.getByRole('button', { name: 'Ver Markdown' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mejorar redacción' }));
    assistant.improve.next('## Dos');
    fixture.detectChanges();

    expect(screen.getByTestId('suggestion-preview').querySelector('h2')?.textContent).toBe('Dos');
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

  describe('mejorar con mi contexto (ADR-027)', () => {
    const suggestion: ContextSuggestion = {
      suggestion: '- Resume la sección de herramientas.<script>alert(1)</script>',
      internalLinks: [{ postId: 'p1', title: 'Orquestar agentes', reason: 'En la introducción.' }],
      contradictions: [{ postId: 'p2', title: 'Workflows primero', note: 'Allí recomiendas un workflow fijo.' }],
      posts: [
        { postId: 'p1', slug: 'orquestar-agentes', title: 'Orquestar agentes', sections: ['Herramientas', 'Límites'] },
        { postId: 'p2', slug: 'workflows-primero', title: 'Workflows primero', sections: [] },
      ],
    };

    it('no ofrece el botón mientras el RAG está apagado', async () => {
      const { assistant, fixture } = await renderPanel();

      expect(screen.queryByRole('button', { name: 'Mejorar con mi contexto' })).toBeNull();

      assistant.ragEnabled.next(true);
      fixture.detectChanges();

      expect(screen.getByRole('button', { name: 'Mejorar con mi contexto' })).toBeTruthy();
    });

    it('envía el id del post y muestra la sugerencia con los posts usados', async () => {
      const assistant = new ControlledAssistant();
      assistant.ragEnabled.next(true);
      const { fixture } = await renderPanel(assistant);

      await fireEvent.click(screen.getByRole('button', { name: 'Mejorar con mi contexto' }));
      expect(status().textContent).toContain('Pensando: Mejorar con mi contexto');
      expect(assistant.contextDrafts).toEqual([{ title: 'Hola', content: '# Hola', postId: 'post-9' }]);

      assistant.context.next(suggestion);
      fixture.detectChanges();

      const card = await screen.findByRole('article', { name: 'Sugerencias con tu contexto' });
      await waitFor(() => expect(document.activeElement).toBe(card));

      // Sanitizado como cualquier post: el <script> no llega al DOM.
      const rendered = screen.getByTestId('context-suggestion');
      expect(rendered.querySelector('script')).toBeNull();
      expect(rendered.textContent).toContain('Resume la sección de herramientas.');

      expect(screen.getByTestId('context-links').textContent).toContain('«Orquestar agentes»: En la introducción.');
      expect(screen.getByTestId('context-contradictions').textContent).toContain('Allí recomiendas un workflow fijo.');

      const link = screen.getByRole('link', { name: /Orquestar agentes/ });
      expect(link.getAttribute('href')).toBe('/posts/p1');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(link.textContent).toContain('(se abre en otra pestaña)');
      expect(screen.getByTestId('context-posts').textContent).toContain('Herramientas, Límites');

      // Solo se lee: no hay nada que aplicar.
      expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
      expect(screen.queryByRole('article')).toBeNull();
      expect(status().textContent).toContain('Sugerencia descartada.');
    });

    it('dice cuando ningún post se usó como contexto', async () => {
      const assistant = new ControlledAssistant();
      assistant.ragEnabled.next(true);
      const { fixture } = await renderPanel(assistant);

      await fireEvent.click(screen.getByRole('button', { name: 'Mejorar con mi contexto' }));
      assistant.context.next({ suggestion: 'Algo.', internalLinks: [], contradictions: [], posts: [] });
      fixture.detectChanges();

      expect((await screen.findByTestId('context-empty')).textContent).toContain('la sugerencia no usa contexto');
      expect(screen.queryByTestId('context-links')).toBeNull();
    });

    it('muestra el error del asistente', async () => {
      const assistant = new ControlledAssistant();
      assistant.ragEnabled.next(true);
      assistant.failWith = new AssistantError('El contexto de tus posts está desactivado en la API (RAG_ENABLED=false).');
      await renderPanel(assistant);

      await fireEvent.click(screen.getByRole('button', { name: 'Mejorar con mi contexto' }));

      expect((await screen.findByRole('alert')).textContent).toContain('RAG_ENABLED=false');
    });
  });
});
