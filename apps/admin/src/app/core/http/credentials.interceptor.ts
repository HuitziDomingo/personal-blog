import { HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';

import { API_BASE_URL } from '../config/api-config';
import { isApiRequest } from './api-url';

/**
 * Envía las cookies de sesión solo a la API (ADR-012). Una petición a otro
 * origen sale sin credenciales.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url, inject(API_BASE_URL), inject(DOCUMENT).baseURI)) {
    return next(req);
  }

  return next(req.clone({ withCredentials: true }));
};
