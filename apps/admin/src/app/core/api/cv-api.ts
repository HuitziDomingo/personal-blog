import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { CVLanguage, CVVersion, CVVersionList } from './api-types';

/** Tamaño máximo del PDF (ADR-028, punto 4); la API lo vuelve a comprobar. */
export const MAX_CV_BYTES = 2 * 1024 * 1024;

const PDF_TYPE = 'application/pdf';

/**
 * Endpoints de admin del CV en PDF (ADR-028). Los errores salen como
 * `ApiError`, con el mensaje ya traducido al español.
 */
@Injectable({ providedIn: 'root' })
export class CvApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}${API_PATHS.adminCV}`;

  /** Versiones de los dos idiomas, de la más reciente a la más antigua. */
  list(): Observable<CVVersion[]> {
    return this.http.get<CVVersionList>(this.baseUrl).pipe(
      map((list) => list.items),
      translate(),
    );
  }

  /**
   * Sube el PDF tal cual, sin multipart: el cuerpo es el archivo. La versión
   * nueva queda como la vigente de su idioma.
   */
  upload(language: CVLanguage, file: Blob): Observable<CVVersion> {
    const headers = new HttpHeaders({ 'Content-Type': PDF_TYPE });
    return this.http.post<CVVersion>(`${this.baseUrl}/${language}`, file, { headers }).pipe(translate());
  }

  setCurrent(id: string): Observable<CVVersion> {
    // Igual que en PostsApi: el ID no debe poder cambiar la ruta de la petición.
    const safeId = encodeURIComponent(id).replaceAll('.', '%2E');
    return this.http.post<CVVersion>(`${this.baseUrl}/versions/${safeId}/current`, null).pipe(translate());
  }
}

function translate<T>() {
  return catchError<T, Observable<never>>((error: unknown) => throwError(() => ApiError.from(error, 'cv')));
}
