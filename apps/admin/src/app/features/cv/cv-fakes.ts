import { Observable, of, throwError } from 'rxjs';

import { CVLanguage, CVVersion } from '../../core/api/api-types';
import { ApiError } from '../../core/http/api-error';

/** Una versión de ejemplo; `overrides` cambia lo que el test necesite. */
export function aCvVersion(overrides: Partial<CVVersion> = {}): CVVersion {
  return {
    id: 'v1',
    language: 'es',
    url: 'http://localhost:8080/media/cv/es/0123456789abcdef01234567.pdf',
    size: 150 * 1024,
    uploadedAt: '2026-11-19T18:00:00Z',
    current: true,
    ...overrides,
  };
}

type Action = 'list' | 'upload' | 'setCurrent';

/**
 * Doble de CvApi escrito a mano (ADR-015). Guarda las versiones en memoria y
 * aplica las acciones como la API: subir crea una versión vigente y marcar
 * la vigente desmarca la anterior del mismo idioma.
 */
export class FakeCvApi {
  versions: CVVersion[] = [];
  uploads: { language: CVLanguage; file: Blob }[] = [];
  currentCalls: string[] = [];
  listCalls = 0;
  /** Si está, la próxima llamada de esa acción responde con este error. */
  nextError: Partial<Record<Action, ApiError>> = {};

  list(): Observable<CVVersion[]> {
    this.listCalls++;
    const error = this.take('list');
    return error ? throwError(() => error) : of([...this.versions]);
  }

  upload(language: CVLanguage, file: Blob): Observable<CVVersion> {
    this.uploads.push({ language, file });
    const error = this.take('upload');
    if (error) {
      return throwError(() => error);
    }
    const version = aCvVersion({ id: `v${this.versions.length + 1}`, language, size: file.size, current: true });
    this.versions = [version, ...this.versions.map((v) => (v.language === language ? { ...v, current: false } : v))];
    return of(version);
  }

  setCurrent(id: string): Observable<CVVersion> {
    this.currentCalls.push(id);
    const error = this.take('setCurrent');
    if (error) {
      return throwError(() => error);
    }
    const target = this.versions.find((v) => v.id === id);
    if (!target) {
      return throwError(() => new ApiError('Esa versión del CV ya no existe. Recarga la lista.', 404, null));
    }
    this.versions = this.versions.map((v) => (v.language === target.language ? { ...v, current: v.id === id } : v));
    return of({ ...target, current: true });
  }

  private take(action: Action): ApiError | undefined {
    const error = this.nextError[action];
    delete this.nextError[action];
    return error;
  }
}
