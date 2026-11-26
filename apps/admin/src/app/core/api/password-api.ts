import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { ApiError } from '../http/api-error';
import { API_PATHS } from '../http/api-url';
import { PasswordChange } from './api-types';

/**
 * Cambio de contraseña del admin (ADR-032). La API revoca todas las sesiones
 * del usuario y responde con las cookies de una nueva para este navegador, así
 * que aquí la sesión sigue abierta. Los errores salen como `ApiError`.
 */
@Injectable({ providedIn: 'root' })
export class PasswordApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  change(body: PasswordChange): Observable<void> {
    return this.http.post<null>(`${this.baseUrl}${API_PATHS.password}`, body).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => ApiError.from(error, 'password'))),
    );
  }
}
