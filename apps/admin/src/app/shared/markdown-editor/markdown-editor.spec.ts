import { fireEvent, render, screen, within } from '@testing-library/angular';

import { MarkdownEditor, PREVIEW_DEBOUNCE_MS } from './markdown-editor';
import { MILKDOWN_THEME_LOADER } from './milkdown-theme';
import { paste, installMissingBrowserApis } from './milkdown-test-support';

/** jsdom no carga hojas de estilo: el fake da el tema por cargado (ADR-015). */
const themeLoaded = { provide: MILKDOWN_THEME_LOADER, useValue: { load: () => Promise.resolve() } };

/** El área editable de Milkdown, cuando ya cargó. */
const editable = () => screen.findByRole('textbox', { name: 'Contenido' });
const preview = () => screen.getByRole('region', { name: 'Vista previa' });

describe('MarkdownEditor', () => {
  beforeAll(installMissingBrowserApis);

  it('muestra un aviso mientras carga Milkdown', async () => {
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' } });
    const loading = screen.getByText('Cargando el editor…');

    expect(loading.parentElement?.getAttribute('aria-busy')).toBe('true');
    const editor = await editable();
    expect(screen.queryByText('Cargando el editor…')).toBeNull();
    expect(editor.closest('[aria-busy]')).toBeNull();
  });

  it('muestra el valor en el editor y su vista previa', async () => {
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '# Hola\n\n**mundo**' } });

    const editor = await editable();
    expect(editor.querySelector('h1')?.textContent).toBe('Hola');
    expect(editor.querySelector('strong')?.textContent).toBe('mundo');
    expect(preview().querySelector('h1')?.textContent).toBe('Hola');
    expect(preview().querySelector('strong')?.textContent).toBe('mundo');
  });

  it('emite valueChange con el Markdown tras el debounce de Milkdown', async () => {
    const valueChange = vi.fn();
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' }, on: { valueChange } });
    const editor = await editable();

    paste(editor, { text: '# Hola' });
    expect(valueChange).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(valueChange).toHaveBeenCalledExactlyOnceWith('# Hola\n'));
  });

  it('flush emite ya lo pendiente, sin esperar el debounce', async () => {
    const valueChange = vi.fn();
    const { fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' }, on: { valueChange } });
    const editor = await editable();

    paste(editor, { text: '# Hola' });
    fixture.componentInstance.flush();

    expect(valueChange).toHaveBeenCalledExactlyOnceWith('# Hola\n');
  });

  it('espera el tema antes de crear el editor', async () => {
    let themeReady!: () => void;
    const theme = { load: () => new Promise<void>((resolve) => (themeReady = resolve)) };
    await render(MarkdownEditor, { providers: [{ provide: MILKDOWN_THEME_LOADER, useValue: theme }], inputs: { value: '' } });

    await import('./milkdown');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('textbox', { name: 'Contenido' })).toBeNull();

    themeReady();
    await editable();
  });

  it('aplica un valor que llega de fuera sin emitir valueChange', async () => {
    const valueChange = vi.fn();
    const { rerender, fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' }, on: { valueChange } });
    const editor = await editable();

    await rerender({ inputs: { value: '# Post cargado' }, partialUpdate: true });
    fixture.detectChanges();

    expect(editor.querySelector('h1')?.textContent).toBe('Post cargado');
    expect(valueChange).not.toHaveBeenCalled();
  });

  // jsdom no ejecuta scripts ni dispara onerror: se comprueba que no quede nada
  // ejecutable en el DOM de la vista previa ni en el del editor.
  it('ni la vista previa ni el editor contienen nada ejecutable', async () => {
    await render(MarkdownEditor, { providers: [themeLoaded],
      inputs: {
        value: '<img src="x" onerror="window.pwned()"><script>window.pwned()</script>[x](javascript:window.pwned())<iframe src="https://evil.test"></iframe>',
      },
    });

    const editor = await editable();
    expect(editor.querySelector('script, iframe, [onerror]')).toBeNull();
    expect(preview().querySelector('script, iframe, [onerror]')).toBeNull();
    expect(preview().querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(preview().querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });

  it('se puede desactivar', async () => {
    const valueChange = vi.fn();
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '', disabled: true }, on: { valueChange } });

    const editor = await editable();
    paste(editor, { text: 'texto' });

    expect(editor.getAttribute('contenteditable')).toBe('false');
    expect(editor.getAttribute('aria-disabled')).toBe('true');
    expect(valueChange).not.toHaveBeenCalled();
  });

  it('marca el editor como inválido y lo enlaza con su error', async () => {
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '', invalid: true, describedBy: 'content-error' } });

    const editor = await editable();
    expect(editor.getAttribute('aria-invalid')).toBe('true');
    expect(editor.getAttribute('aria-describedby')).toBe('content-error');
    expect(editor.getAttribute('aria-multiline')).toBe('true');
  });

  it('emite touched al salir del editor, no al moverse dentro de él', async () => {
    const touched = vi.fn();
    await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' }, on: { touched } });
    const editor = await editable();

    await fireEvent.focusOut(editor, { relatedTarget: editor });
    expect(touched).not.toHaveBeenCalled();

    await fireEvent.focusOut(editor, { relatedTarget: document.body });
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('destruye Milkdown al destruirse', async () => {
    const { fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '# Hola' } });
    await editable();
    const host = fixture.nativeElement as HTMLElement;

    fixture.destroy();
    await vi.waitFor(() => expect(host.querySelector('.ProseMirror')).toBeNull());
  });

  it('si se destruye mientras carga, no deja un editor creado', async () => {
    const { fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '# Hola' } });
    const host = fixture.nativeElement as HTMLElement;

    fixture.destroy();
    // El componente espera este mismo import; después, lo que tarda en crearse
    // un editor (en los demás tests, unos pocos ms).
    await import('./milkdown');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(host.querySelector('.ProseMirror')).toBeNull();
  });

  describe('barra de herramientas', () => {
    const toolbar = () => screen.getByRole('toolbar', { name: 'Formato' });
    const button = (name: string) => within(toolbar()).getByRole('button', { name });

    /** Selecciona todo el texto con Ctrl+A, que ProseMirror maneja en keydown. */
    function selectAll(editor: HTMLElement): void {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true }));
    }

    /** Abre el editor con `markdown`, selecciona todo y aplica el botón `name`. */
    async function applyTo(markdown: string, name: string) {
      const valueChange = vi.fn();
      const { fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: markdown }, on: { valueChange } });
      const editor = await editable();
      await vi.waitFor(() => expect(button(name).hasAttribute('disabled')).toBe(false));
      selectAll(editor);
      await fireEvent.click(button(name));
      fixture.componentInstance.flush();
      return { valueChange, fixture, editor };
    }

    it('es una barra con nombre, enlazada al área de texto', async () => {
      await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' } });
      const editor = await editable();

      expect(toolbar().getAttribute('aria-controls')).toBe(editor.id);
      expect(
        within(toolbar()).getAllByRole('button').map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Título 2', 'Título 3', 'Título 4', 'Negritas', 'Cursivas', 'Código', 'Lista con viñetas', 'Lista numerada', 'Cita', 'Bloque de código', 'Link']);
    });

    it.each([
      ['Título 2', 'texto', '## texto\n'],
      ['Título 3', 'texto', '### texto\n'],
      ['Título 4', 'texto', '#### texto\n'],
      ['Negritas', 'texto', '**texto**\n'],
      ['Cursivas', 'texto', '*texto*\n'],
      ['Código', 'texto', '`texto`\n'],
      ['Lista con viñetas', 'texto', '* texto\n'],
      ['Lista numerada', 'texto', '1. texto\n'],
      ['Cita', 'texto', '> texto\n'],
      ['Bloque de código', 'texto', '```\ntexto\n```\n'],
      // Aplicado otra vez, se quita.
      ['Título 2', '## texto', 'texto\n'],
      ['Título 3', '### texto', 'texto\n'],
      ['Título 4', '#### texto', 'texto\n'],
      // Sobre un título de otro nivel, incluido un H1 pegado, cambia el nivel.
      ['Título 2', '# texto', '## texto\n'],
      ['Título 4', '## texto', '#### texto\n'],
      ['Negritas', '**texto**', 'texto\n'],
      ['Lista con viñetas', '* texto', 'texto\n'],
      ['Cita', '> texto', 'texto\n'],
      ['Bloque de código', '```\ntexto\n```', 'texto\n'],
      // Sobre la otra lista, cambia su tipo.
      ['Lista numerada', '* uno\n* dos', '1. uno\n2. dos\n'],
    ])('%s sobre %j da %j', async (name, markdown, expected) => {
      const { valueChange } = await applyTo(markdown, name);

      expect(valueChange).toHaveBeenLastCalledWith(expected);
    });

    it('Link abre la edición del link y guarda la URL al confirmar', async () => {
      const { valueChange, fixture } = await applyTo('texto', 'Link');
      const input = await vi.waitFor(() => {
        const found = document.querySelector<HTMLInputElement>('.milkdown-link-edit input');
        expect(found).not.toBeNull();
        return found!;
      });

      await fireEvent.input(input, { target: { value: 'https://huitzi.xyz' } });
      await fireEvent.keyDown(input, { key: 'Enter' });
      fixture.componentInstance.flush();

      expect(valueChange).toHaveBeenLastCalledWith('[texto](https://huitzi.xyz)\n');
    });

    it('marca con aria-pressed el formato donde está el cursor', async () => {
      const { fixture } = await applyTo('## texto', 'Negritas');
      fixture.detectChanges();

      expect(button('Negritas').getAttribute('aria-pressed')).toBe('true');
      expect(button('Título 2').getAttribute('aria-pressed')).toBe('true');
      expect(button('Título 3').getAttribute('aria-pressed')).toBe('false');
      expect(button('Título 4').getAttribute('aria-pressed')).toBe('false');
      expect(button('Cursivas').getAttribute('aria-pressed')).toBe('false');
    });

    it('se recorre con las flechas, Inicio y Fin, con un solo botón tabulable, y Escape vuelve al texto', async () => {
      const { fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' } });
      const editor = await editable();
      const tabbable = () => within(toolbar()).getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable().map((b) => b.getAttribute('aria-label'))).toEqual(['Título 2']);

      button('Título 2').focus();
      await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(button('Título 3'));
      await fireEvent.keyDown(document.activeElement!, { key: 'End' });
      expect(document.activeElement).toBe(button('Link'));
      await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(button('Título 2'));
      await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(button('Link'));
      fixture.detectChanges();
      expect(tabbable().map((b) => b.getAttribute('aria-label'))).toEqual(['Link']);
      await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
      expect(document.activeElement).toBe(button('Título 2'));

      await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(document.activeElement).toBe(editor);
    });

    it('con el mouse no le quita el foco al editor', async () => {
      await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' } });
      await editable();

      expect(fireEvent.mouseDown(button('Negritas'))).toBe(false);
    });

    it('se desactiva mientras carga y con el editor desactivado', async () => {
      const { rerender, fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '' } });
      expect(button('Negritas').hasAttribute('disabled')).toBe(true);

      await editable();
      await vi.waitFor(() => expect(button('Negritas').hasAttribute('disabled')).toBe(false));

      await rerender({ inputs: { disabled: true }, partialUpdate: true });
      fixture.detectChanges();
      expect(button('Negritas').hasAttribute('disabled')).toBe(true);
    });
  });

  describe('debounce de la vista previa', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it(`actualiza la vista previa ${PREVIEW_DEBOUNCE_MS} ms después del último cambio`, async () => {
      const { rerender, fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: '# Uno' } });
      expect(preview().querySelector('h1')?.textContent).toBe('Uno');

      await rerender({ inputs: { value: '# Dos' }, partialUpdate: true });
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 1);
      fixture.detectChanges();
      expect(preview().querySelector('h1')?.textContent).toBe('Uno');

      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();
      expect(preview().querySelector('h1')?.textContent).toBe('Dos');
    });

    it('cada cambio reinicia la espera y solo se renderiza el último valor', async () => {
      const { rerender, fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: 'a' } });

      for (const value of ['ab', 'abc', 'abcd']) {
        await rerender({ inputs: { value }, partialUpdate: true });
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 50);
        fixture.detectChanges();
        expect(preview().querySelector('.preview')?.textContent?.trim()).toBe('a');
      }

      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
      fixture.detectChanges();
      expect(preview().querySelector('.preview')?.textContent?.trim()).toBe('abcd');
    });

    it('cancela el timer pendiente al destruirse', async () => {
      const { rerender, fixture } = await render(MarkdownEditor, { providers: [themeLoaded], inputs: { value: 'a' } });
      // Solo el timer de la vista previa: el scheduler zoneless tiene los suyos.
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      await rerender({ inputs: { value: 'b' }, partialUpdate: true });
      fixture.detectChanges();
      const call = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === PREVIEW_DEBOUNCE_MS);
      expect(call).toBeGreaterThanOrEqual(0);
      const timer = setTimeoutSpy.mock.results[call]?.value;

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    });
  });
});
