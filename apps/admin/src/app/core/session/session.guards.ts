import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { SessionService } from './session.service';

/** Deja pasar solo con sesión; si no, va a `/login` con la URL de regreso. */
export const authGuard: CanMatchFn = (_route, segments) => {
  const session = inject(SessionService);
  const router = inject(Router);

  const attempted = router.currentNavigation()?.extractedUrl;
  const returnUrl = attempted
    ? router.serializeUrl(attempted)
    : `/${segments.map((segment) => segment.path).join('/')}`;

  return session
    .ensureLoaded()
    .pipe(
      map((status) =>
        status === 'authenticated' ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl } }),
      ),
    );
};

/** `/login` con sesión iniciada lleva a `/`, que redirige a la lista de posts. */
export const guestGuard: CanMatchFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session
    .ensureLoaded()
    .pipe(map((status) => (status === 'authenticated' ? router.createUrlTree(['/']) : true)));
};

/**
 * Ruta pública (BLOG-130): deja pasar con o sin sesión, pero primero resuelve
 * la sesión con /auth/me, como las demás, para que la pantalla sepa a dónde
 * volver.
 */
export const anyoneGuard: CanMatchFn = () =>
  inject(SessionService)
    .ensureLoaded()
    .pipe(map(() => true));
