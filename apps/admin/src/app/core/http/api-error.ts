import { HttpErrorResponse } from '@angular/common/http';

import { Problem } from '../api/api-types';
import { ProblemContext, problemMessage } from './problem-messages';

/**
 * Error de una llamada a la API ya traducido para mostrarlo. `message` está en
 * español (problemMessage); `status` y `detail` (el `detail` en inglés del
 * problem+json, si llegó) sirven para decidir qué hacer, no para mostrarse.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(error: unknown, context: ProblemContext = 'generic'): ApiError {
    const status = error instanceof HttpErrorResponse ? error.status : 0;

    return new ApiError(problemMessage(error, context), status, problemDetail(error));
  }
}

function problemDetail(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null || !('detail' in body)) {
    return null;
  }

  const { detail } = body as Pick<Problem, 'detail'>;

  return typeof detail === 'string' ? detail : null;
}
