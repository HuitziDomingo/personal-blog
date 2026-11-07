// Fake de SessionService para los tests (ADR-015). Solo lo importan los
// .spec.ts, así que no llega al bundle.
import { signal } from '@angular/core';
import { Observable, of } from 'rxjs';

import { User } from '../api/api-types';

/** Lo que usan el menú y el shell: el usuario y cerrar sesión. */
export class FakeSession {
  readonly user = signal<User | null>({ id: 'u1', email: 'leon@huitzi.xyz', role: 'admin' });
  logoutCalls = 0;

  logout(): Observable<void> {
    this.logoutCalls++;

    return of(undefined);
  }
}
