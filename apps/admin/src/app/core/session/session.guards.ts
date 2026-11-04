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

/** `/login` con sesión iniciada lleva al dashboard. */
export const guestGuard: CanMatchFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session
    .ensureLoaded()
    .pipe(map((status) => (status === 'authenticated' ? router.createUrlTree(['/']) : true)));
};
