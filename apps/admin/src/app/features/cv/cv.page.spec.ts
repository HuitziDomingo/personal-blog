import { fireEvent, render, screen, within } from '@testing-library/angular';

import { CvApi } from '../../core/api/cv-api';
import { ApiError } from '../../core/http/api-error';
import { aCvVersion, FakeCvApi } from './cv-fakes';
import { CvPage } from './cv.page';

async function renderPage(api = new FakeCvApi()) {
  const result = await render(CvPage, { providers: [{ provide: CvApi, useValue: api }] });
  return { ...result, api };
}

function pdf(name = 'cv.pdf', size = 1000, type = 'application/pdf'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function choose(input: HTMLElement, file: File): void {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('CvPage', () => {
  it('muestra siempre el aviso de que el PDF es público', async () => {
    await renderPage();

    const note = screen.getByRole('note');
    expect(note.textContent?.trim()).toBe('Este PDF será público. No incluyas tu teléfono ni datos privados.');
  });

  it('muestra la vigente de cada idioma y avisa si falta', async () => {
    const api = new FakeCvApi();
    api.versions = [aCvVersion({ id: 'es1', language: 'es', current: true })];
    await renderPage(api);

    const spanish = screen.getByRole('region', { name: 'Español' });
    expect(within(spanish).getByText(/Vigente: subido el/)).toBeTruthy();
    expect(within(spanish).getByRole('link', { name: 'Descargar el PDF vigente en español' }).getAttribute('href')).toBe(api.versions[0].url);

    const english = screen.getByRole('region', { name: 'Inglés' });
    expect(within(english).getByText('Sin PDF vigente: la web no muestra el botón de descarga.')).toBeTruthy();
  });

  it('sube el PDF del idioma y recarga la lista', async () => {
    const { api, fixture } = await renderPage();
    const file = pdf();

    choose(screen.getByLabelText('PDF en inglés'), file);
    fireEvent.click(screen.getByRole('button', { name: 'Subir PDF en inglés' }));
    fixture.detectChanges();

    expect(api.uploads).toEqual([{ language: 'en', file }]);
    expect(screen.getByRole('status').textContent).toBe('PDF en inglés subido; ya es el vigente.');
    expect(api.listCalls).toBe(2);
    expect(within(screen.getByRole('region', { name: 'Inglés' })).getByText(/Vigente: subido el/)).toBeTruthy();
  });

  it.each([
    ['sin archivo', null, 'Elige un archivo PDF.'],
    ['otro tipo', pdf('foto.png', 100, 'image/png'), 'El archivo debe ser un PDF.'],
    ['vacío', pdf('cv.pdf', 0), 'El archivo está vacío.'],
    ['más de 2 MB', pdf('cv.pdf', 2 * 1024 * 1024 + 1), 'El PDF pesa 2 MB; el máximo es 2 MB.'],
  ])('valida en el navegador: %s', async (_, file, message) => {
    const { api, fixture } = await renderPage();
    const input = screen.getByLabelText('PDF en español');
    if (file) {
      choose(input, file);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Subir PDF en español' }));
    fixture.detectChanges();

    expect(api.uploads).toEqual([]);
    expect(screen.getByText(message)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('cv-es-ayuda cv-es-error');
    expect(document.activeElement).toBe(input);
  });

  it('acepta un .pdf sin tipo, como lo dan algunos sistemas', async () => {
    const { api } = await renderPage();

    choose(screen.getByLabelText('PDF en español'), pdf('cv.PDF', 10, ''));
    fireEvent.click(screen.getByRole('button', { name: 'Subir PDF en español' }));

    expect(api.uploads).toHaveLength(1);
  });

  it('muestra el error de la API junto al campo', async () => {
    const api = new FakeCvApi();
    api.nextError.upload = new ApiError('El archivo no es un PDF válido.', 400, 'file must be a PDF');
    const { fixture } = await renderPage(api);

    choose(screen.getByLabelText('PDF en español'), pdf());
    fireEvent.click(screen.getByRole('button', { name: 'Subir PDF en español' }));
    fixture.detectChanges();

    expect(screen.getByText('El archivo no es un PDF válido.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subir PDF en español' }).hasAttribute('disabled')).toBe(false);
  });

  it('lista las versiones y marca otra como vigente', async () => {
    const api = new FakeCvApi();
    api.versions = [
      aCvVersion({ id: 'nueva', uploadedAt: '2026-11-19T18:00:00Z', current: true }),
      aCvVersion({ id: 'vieja', uploadedAt: '2026-10-01T18:00:00Z', current: false }),
    ];
    const { fixture } = await renderPage(api);

    const list = screen.getByRole('list', { name: 'Versiones' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // «Vigente» se lee como texto, no solo por el color.
    expect(within(items[0]).getByText('Vigente')).toBeTruthy();
    expect(within(items[0]).queryByRole('button', { name: /Marcar como vigente/ })).toBeNull();

    fireEvent.click(within(items[1]).getByRole('button', { name: /Marcar como vigente la versión en español/ }));
    fixture.detectChanges();

    expect(api.currentCalls).toEqual(['vieja']);
    expect(screen.getByRole('status').textContent).toMatch(/^La versión en español del .+ es la vigente\.$/);
    expect(within(screen.getAllByRole('listitem')[1]).getByText('Vigente')).toBeTruthy();
  });

  it('si la lista falla, deja reintentar', async () => {
    const api = new FakeCvApi();
    api.nextError.list = new ApiError('No se pudo conectar con el servidor.', 0, null);
    const { fixture } = await renderPage(api);

    expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar con el servidor.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fixture.detectChanges();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Todavía no subiste ningún PDF.')).toBeTruthy();
  });
});
