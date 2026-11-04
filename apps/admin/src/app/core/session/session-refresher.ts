import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { finalize, map, Observable, shareReplay } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { API_PATHS } from '../http/api-url';

/**
 * Renueva la sesión con un solo `POST /auth/refresh` a la vez (ADR-012). Las
 * peticiones que reciben 401 mientras hay un refresh en curso esperan a ese
 * mismo refresh: dos refresh concurrentes con el mismo token harían que la
 * API detecte reutilización y revoque la sesión.
 */
@Injectable({ providedIn: 'root' })
export class SessionRefresher {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private inFlight: Observable<void> | null = null;

  refresh(): Observable<void> {
    this.inFlight ??= this.http.post<void>(`${this.apiBaseUrl}${API_PATHS.refresh}`, null).pipe(
      map(() => undefined),
      finalize(() => (this.inFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.inFlight;
  }
}
