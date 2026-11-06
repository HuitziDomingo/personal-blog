import { fireEvent, render, screen } from '@testing-library/angular';

import { MarkdownEditor } from './markdown-editor';

describe('MarkdownEditor', () => {
  it('muestra el valor en el textarea y su vista previa', async () => {
    await render(MarkdownEditor, { inputs: { value: '# Hola\n\n**mundo**' } });

    expect((screen.getByLabelText('Contenido') as HTMLTextAreaElement).value).toBe('# Hola\n\n**mundo**');
    const preview = screen.getByRole('region', { name: 'Vista previa' });
    expect(preview.querySelector('h1')?.textContent).toBe('Hola');
    expect(preview.querySelector('strong')?.textContent).toBe('mundo');
  });

  it('emite valueChange al escribir', async () => {
    const valueChange = vi.fn();
    await render(MarkdownEditor, { inputs: { value: '' }, on: { valueChange } });

    await fireEvent.input(screen.getByLabelText('Contenido'), { target: { value: 'nuevo' } });

    expect(valueChange).toHaveBeenCalledWith('nuevo');
  });

  // jsdom no ejecuta scripts ni dispara onerror: se comprueba que no quede nada
  // ejecutable en el DOM de la vista previa.
  it('la vista previa no contiene nada ejecutable', async () => {
    await render(MarkdownEditor, {
      inputs: {
        value: '<img src="x" onerror="window.pwned()"><script>window.pwned()</script>[x](javascript:window.pwned())<iframe src="https://evil.test"></iframe>',
      },
    });

    const preview = screen.getByRole('region', { name: 'Vista previa' });
    expect(preview.querySelector('script, iframe, [onerror]')).toBeNull();
    expect(preview.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(preview.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });

  it('se puede desactivar', async () => {
    await render(MarkdownEditor, { inputs: { value: '', disabled: true } });

    expect(screen.getByLabelText('Contenido').hasAttribute('disabled')).toBe(true);
  });

  it('marca el textarea como inválido y lo enlaza con su error', async () => {
    await render(MarkdownEditor, { inputs: { value: '', invalid: true, describedBy: 'content-error' } });

    const textarea = screen.getByLabelText('Contenido');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(textarea.getAttribute('aria-describedby')).toBe('content-error');
  });
});
