import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay, tap } from 'rxjs';

import { LoginRequest, User } from '../api/api-types';
import { API_BASE_URL } from '../config/api-config';
import { API_PATHS } from '../http/api-url';
import { safeReturnUrl } from './return-url';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Estado de la sesión del admin. La cookie es HttpOnly, así que la única forma
 * de saber si hay sesión es preguntarle a la API con `GET /auth/me` (ADR-012).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly _user = signal<User | null>(null);
  private readonly _status = signal<SessionStatus>('unknown');

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  private loading: Observable<SessionStatus> | null = null;

  /**
   * Resuelve el estado de la sesión. Consulta `/auth/me` una sola vez: las
   * llamadas simultáneas comparten la misma petición y, una vez conocido el
   * estado, no se vuelve a preguntar.
   */
  ensureLoaded(): Observable<SessionStatus> {
    const status = this._status();
    if (status !== 'unknown') {
      return of(status);
    }

    this.loading ??= this.http.get<User>(this.url(API_PATHS.me)).pipe(
      map((user): SessionStatus => {
        this.authenticate(user);

        return 'authenticated';
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.clear();
        }

        // Ante un error de red o del servidor el estado sigue desconocido, y la
        // siguiente navegación vuelve a preguntar.
        return of<SessionStatus>('anonymous');
      }),
      finalize(() => (this.loading = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.loading;
  }

  login(credentials: LoginRequest): Observable<User> {
    return this.http
      .post<User>(this.url(API_PATHS.login), credentials)
      .pipe(tap((user) => this.authenticate(user)));
  }

  /** Cierra la sesión en la API y la limpia aquí aunque la petición falle. */
  logout(): Observable<void> {
    return this.http.post<void>(this.url(API_PATHS.logout), null).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => {
        this.clear();
        void this.router.navigateByUrl('/login');
      }),
    );
  }

  /**
   * La sesión venció y no se pudo renovar. Solo redirige si había sesión: en
   * la primera consulta a `/me`, la redirección la hace el guard.
   */
  expire(returnUrl: string): void {
    const wasAuthenticated = this._status() === 'authenticated';
    this.clear();

    if (wasAuthenticated) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: safeReturnUrl(returnUrl) },
      });
    }
  }

  private authenticate(user: User): void {
    this._user.set(user);
    this._status.set('authenticated');
  }

  private clear(): void {
    this._user.set(null);
    this._status.set('anonymous');
  }

  private url(path: string): string {
    return `${this.apiBaseUrl}${path}`;
  }
}
