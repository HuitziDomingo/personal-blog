import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { aCvVersion } from '../../features/cv/cv-fakes';
import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { CvApi } from './cv-api';

const API = 'http://api.test';
const CV = `${API}/api/v1/admin/cv`;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
  });
  return { api: TestBed.inject(CvApi), httpMock: TestBed.inject(HttpTestingController) };
}

describe('CvApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista las versiones', async () => {
    const { api, httpMock } = setup();
    const version = aCvVersion();

    const result = firstValueFrom(api.list());
    const request = httpMock.expectOne(CV);
    expect(request.request.method).toBe('GET');
    request.flush({ items: [version] });

    expect(await result).toEqual([version]);
  });

  it('sube el archivo tal cual, como application/pdf', async () => {
    const { api, httpMock } = setup();
    const file = new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' });

    const result = firstValueFrom(api.upload('en', file));
    const request = httpMock.expectOne(`${CV}/en`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('application/pdf');
    request.flush(aCvVersion({ language: 'en' }));

    expect((await result).language).toBe('en');
  });

  it('marca la vigente sin dejar que el id cambie la ruta', () => {
    const { api, httpMock } = setup();

    api.setCurrent('../x').subscribe();
    const request = httpMock.expectOne(`${CV}/versions/%2E%2E%2Fx/current`);
    expect(request.request.method).toBe('POST');
    request.flush(aCvVersion());
  });

  it.each([
    [400, { detail: 'file must be a PDF' }, 'El archivo no es un PDF válido.'],
    [413, { detail: 'request body too large' }, 'El PDF pesa más de 2 MB.'],
    [503, { detail: 'file storage is not configured' }, 'La API no tiene almacenamiento de archivos configurado (FILES_STORE): no se puede subir el PDF.'],
    [503, { detail: 'file storage is unavailable' }, 'No se pudo guardar el PDF. Inténtalo de nuevo en unos minutos.'],
  ])('traduce el %d de la subida', async (status, body, message) => {
    const { api, httpMock } = setup();

    const result = firstValueFrom(api.upload('es', new Blob(['x'])));
    httpMock.expectOne(`${CV}/es`).flush(body, { status, statusText: 'Error' });

    await expect(result).rejects.toEqual(new ApiError(message, status, body.detail));
  });
});
