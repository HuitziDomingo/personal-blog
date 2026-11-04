import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import { SessionRefresher } from '../session/session-refresher';
import { SessionService } from '../session/session.service';
import { API_PATHS, isApiPath, isApiRequest } from './api-url';

/**
 * Ante un 401 de la API renueva la sesión una vez y reintenta la petición
 * original (ADR-012). No actúa sobre `/auth/login`, donde un 401 son
 * credenciales inválidas, ni sobre `/auth/refresh`, para no entrar en bucle.
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBaseUrl = inject(API_BASE_URL);
  const baseUri = inject(DOCUMENT).baseURI;

  if (
    !isApiRequest(req.url, apiBaseUrl, baseUri) ||
    isApiPath(req.url, apiBaseUrl, baseUri, API_PATHS.login) ||
    isApiPath(req.url, apiBaseUrl, baseUri, API_PATHS.refresh)
  ) {
    return next(req);
  }

  const refresher = inject(SessionRefresher);
  const session = inject(SessionService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return refresher.refresh().pipe(
        catchError(() => {
          session.expire(router.url);

          return throwError(() => error);
        }),
        // El reintento usa next y no HttpClient: no vuelve a pasar por este
        // catchError, así que un 401 del reintento no dispara otro refresh.
        switchMap(() => next(req)),
      );
    }),
  );
};
