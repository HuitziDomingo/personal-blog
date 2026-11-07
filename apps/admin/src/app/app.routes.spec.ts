import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';

import { routes } from './app.routes';
import { PostPage } from './core/api/api-types';
import { PostListQuery, PostsApi } from './core/api/posts-api';
import { FakeMatchMedia, FakeStorage } from './core/browser/browser-fakes';
import { MATCH_MEDIA } from './core/browser/match-media';
import { FakeSession } from './core/session/session-fakes';
import { SessionService, SessionStatus } from './core/session/session.service';
import { THEME_STORAGE } from './core/theme/theme-storage';

/** Fake de PostsApi (ADR-015): una lista vacía. */
class EmptyPostsApi {
  list(query: PostListQuery): Observable<PostPage> {
    return of({ items: [], total: 0, limit: query.limit, offset: query.offset });
  }
}

async function setup(status: SessionStatus) {
  const session = Object.assign(new FakeSession(), { ensureLoaded: () => of(status) });
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: SessionService, useValue: session },
      { provide: PostsApi, useClass: EmptyPostsApi },
      { provide: MATCH_MEDIA, useValue: new FakeMatchMedia().fn },
      { provide: THEME_STORAGE, useValue: new FakeStorage() },
    ],
  });

  const harness = await RouterTestingHarness.create();

  return { harness, router: TestBed.inject(Router) };
}

describe('rutas del admin', () => {
  it('con sesión, / lleva a /posts dentro del shell', async () => {
    const { harness, router } = await setup('authenticated');

    await harness.navigateByUrl('/');

    expect(router.url).toBe('/posts');
    expect(harness.routeNativeElement?.tagName).toBe('APP-ADMIN-SHELL');
    expect(harness.routeNativeElement?.querySelector('main app-posts-list-page')).toBeTruthy();
  });

  it('el login queda fuera del shell', async () => {
    const { harness, router } = await setup('anonymous');

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/login');
    expect(document.querySelector('app-admin-shell')).toBeNull();
    expect(document.querySelector('app-login-page')).toBeTruthy();
  });

  it('sin sesión, una ruta desconocida lleva al login con la URL de regreso', async () => {
    const { harness, router } = await setup('anonymous');

    await harness.navigateByUrl('/foo');

    expect(router.url).toBe('/login?returnUrl=%2Ffoo');
  });

  it('con sesión, una ruta desconocida lleva a /posts', async () => {
    const { harness, router } = await setup('authenticated');

    await harness.navigateByUrl('/foo');

    expect(router.url).toBe('/posts');
  });

  it('con sesión, /login lleva a /posts', async () => {
    const { harness, router } = await setup('authenticated');

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/posts');
  });
});
