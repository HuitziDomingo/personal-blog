import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { authGuard, guestGuard } from './session.guards';
import { SessionService, SessionStatus } from './session.service';

@Component({ template: '' })
class EmptyPage {}

async function setup(status: SessionStatus) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'login', canMatch: [guestGuard], component: EmptyPage },
        { path: 'posts', canMatch: [authGuard], component: EmptyPage },
        { path: '', pathMatch: 'full', canMatch: [authGuard], component: EmptyPage },
      ]),
      { provide: SessionService, useValue: { ensureLoaded: () => of(status) } },
    ],
  });

  const harness = await RouterTestingHarness.create();

  return { harness, router: TestBed.inject(Router) };
}

describe('authGuard', () => {
  it('sin sesión lleva a /login con la URL de regreso, incluida la query', async () => {
    const { harness, router } = await setup('anonymous');

    await harness.navigateByUrl('/posts?page=2');

    expect(router.url).toBe('/login?returnUrl=%2Fposts%3Fpage%3D2');
  });

  it('con sesión deja pasar', async () => {
    const { harness, router } = await setup('authenticated');

    await harness.navigateByUrl('/posts');

    expect(router.url).toBe('/posts');
  });
});

describe('guestGuard', () => {
  it('con sesión, /login lleva al dashboard', async () => {
    const { harness, router } = await setup('authenticated');

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/');
  });

  it('sin sesión muestra /login', async () => {
    const { harness, router } = await setup('anonymous');

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/login');
  });
});
