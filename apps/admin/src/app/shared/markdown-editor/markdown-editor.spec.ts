import { fireEvent, render, screen } from '@testing-library/angular';

import { MarkdownEditor, PREVIEW_DEBOUNCE_MS } from './markdown-editor';
import { paste, installMissingBrowserApis } from './milkdown-test-support';

/** El área editable de Milkdown, cuando ya cargó. */
const editable = () => screen.findByRole('textbox', { name: 'Contenido' });
const preview = () => screen.getByRole('region', { name: 'Vista previa' });

describe('MarkdownEditor', () => {
  beforeAll(installMissingBrowserApis);

  it('muestra un aviso mientras carga Milkdown', async () => {
    await render(MarkdownEditor, { inputs: { value: '' } });
    const loading = screen.getByText('Cargando el editor…');

    expect(loading.parentElement?.getAttribute('aria-busy')).toBe('true');
    const editor = await editable();
    expect(screen.queryByText('Cargando el editor…')).toBeNull();
    expect(editor.closest('[aria-busy]')).toBeNull();
  });

  it('muestra el valor en el editor y su vista previa', async () => {
    await render(MarkdownEditor, { inputs: { value: '# Hola\n\n**mundo**' } });

    const editor = await editable();
    expect(editor.querySelector('h1')?.textContent).toBe('Hola');
    expect(editor.querySelector('strong')?.textContent).toBe('mundo');
    expect(preview().querySelector('h1')?.textContent).toBe('Hola');
    expect(preview().querySelector('strong')?.textContent).toBe('mundo');
  });

  it('emite valueChange con el Markdown en cada cambio, sin espera', async () => {
    const valueChange = vi.fn();
    await render(MarkdownEditor, { inputs: { value: '' }, on: { valueChange } });
    const editor = await editable();

    paste(editor, { text: '# Hola' });
    expect(valueChange).toHaveBeenLastCalledWith('# Hola\n');

    // El cursor quedó al final del título.
    paste(editor, { text: ', mundo' });
    expect(valueChange).toHaveBeenCalledTimes(2);
    expect(valueChange).toHaveBeenLastCalledWith('# Hola, mundo\n');
  });

  it('aplica un valor que llega de fuera sin emitir valueChange', async () => {
    const valueChange = vi.fn();
    const { rerender, fixture } = await render(MarkdownEditor, { inputs: { value: '' }, on: { valueChange } });
    const editor = await editable();

    await rerender({ inputs: { value: '# Post cargado' }, partialUpdate: true });
    fixture.detectChanges();

    expect(editor.querySelector('h1')?.textContent).toBe('Post cargado');
    expect(valueChange).not.toHaveBeenCalled();
  });

  // jsdom no ejecuta scripts ni dispara onerror: se comprueba que no quede nada
  // ejecutable en el DOM de la vista previa ni en el del editor.
  it('ni la vista previa ni el editor contienen nada ejecutable', async () => {
    await render(MarkdownEditor, {
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
    await render(MarkdownEditor, { inputs: { value: '', disabled: true }, on: { valueChange } });

    const editor = await editable();
    paste(editor, { text: 'texto' });

    expect(editor.getAttribute('contenteditable')).toBe('false');
    expect(editor.getAttribute('aria-disabled')).toBe('true');
    expect(valueChange).not.toHaveBeenCalled();
  });

  it('marca el editor como inválido y lo enlaza con su error', async () => {
    await render(MarkdownEditor, { inputs: { value: '', invalid: true, describedBy: 'content-error' } });

    const editor = await editable();
    expect(editor.getAttribute('aria-invalid')).toBe('true');
    expect(editor.getAttribute('aria-describedby')).toBe('content-error');
    expect(editor.getAttribute('aria-multiline')).toBe('true');
  });

  it('emite touched al salir del editor, no al moverse dentro de él', async () => {
    const touched = vi.fn();
    await render(MarkdownEditor, { inputs: { value: '' }, on: { touched } });
    const editor = await editable();

    await fireEvent.focusOut(editor, { relatedTarget: editor });
    expect(touched).not.toHaveBeenCalled();

    await fireEvent.focusOut(editor, { relatedTarget: document.body });
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('destruye Milkdown al destruirse', async () => {
    const { fixture } = await render(MarkdownEditor, { inputs: { value: '# Hola' } });
    await editable();
    const host = fixture.nativeElement as HTMLElement;

    fixture.destroy();
    await vi.waitFor(() => expect(host.querySelector('.ProseMirror')).toBeNull());
  });

  it('si se destruye mientras carga, no deja un editor creado', async () => {
    const { fixture } = await render(MarkdownEditor, { inputs: { value: '# Hola' } });
    const host = fixture.nativeElement as HTMLElement;

    fixture.destroy();
    // El componente espera este mismo import; después, lo que tarda en crearse
    // un editor (en los demás tests, unos pocos ms).
    await import('./milkdown');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(host.querySelector('.ProseMirror')).toBeNull();
  });

  describe('debounce de la vista previa', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it(`actualiza la vista previa ${PREVIEW_DEBOUNCE_MS} ms después del último cambio`, async () => {
      const { rerender, fixture } = await render(MarkdownEditor, { inputs: { value: '# Uno' } });
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
      const { rerender, fixture } = await render(MarkdownEditor, { inputs: { value: 'a' } });

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
      const { rerender, fixture } = await render(MarkdownEditor, { inputs: { value: 'a' } });
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
