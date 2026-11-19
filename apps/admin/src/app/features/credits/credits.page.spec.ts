import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import { FakeMatchMedia, FakeStorage } from '../../core/browser/browser-fakes';
import { MATCH_MEDIA } from '../../core/browser/match-media';
import { FakeSession } from '../../core/session/session-fakes';
import { SessionService } from '../../core/session/session.service';
import { BACKGROUND_INFO, BACKGROUNDS, BACKGROUNDS_SOURCE } from '../../core/theme/backgrounds';
import { THEME_STORAGE } from '../../core/theme/theme-storage';
import { CreditsPage } from './credits.page';

async function renderCredits({ signedIn = false } = {}) {
  const session = new FakeSession();
  if (!signedIn) {
    session.user.set(null);
  }
  await render(CreditsPage, {
    providers: [
      provideRouter([]),
      { provide: SessionService, useValue: session },
      { provide: MATCH_MEDIA, useValue: new FakeMatchMedia().fn },
      { provide: THEME_STORAGE, useValue: new FakeStorage() },
    ],
  });
}

describe('CreditsPage', () => {
  it('tiene un h1 y secciones con encabezado para fondos, fuente y cambios', async () => {
    await renderCredits();

    expect(screen.getByRole('heading', { level: 1, name: 'Créditos' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim())).toEqual([
      'Fondos de pantalla',
      'Fuente',
      'Cambios',
    ]);
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('lista cada fondo de BACKGROUND_INFO con nombre, autor, archivos y licencia', async () => {
    await renderCredits();

    const list = within(screen.getByRole('region', { name: 'Fondos de pantalla' })).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(BACKGROUNDS.length);
    BACKGROUNDS.forEach((id, index) => {
      const info = BACKGROUND_INFO[id];
      const item = within(items[index]);
      expect(item.getByRole('heading', { level: 3 }).textContent).toBe(info.label);
      expect(item.getByText(info.author)).toBeTruthy();
      expect(item.getByText(info.files.light)).toBeTruthy();
      expect(item.getByText(info.files.dark)).toBeTruthy();
      const license = item.getByRole('link');
      expect(license.textContent).toBe(`${info.license} del fondo ${info.label}`);
      expect(license.getAttribute('href')).toBe(info.licenseUrl);
    });
  });

  it('cita la fuente y los cambios con links descriptivos', async () => {
    await renderCredits();

    expect(
      screen.getByRole('link', { name: 'repositorio de gnome-backgrounds en el GitLab de GNOME' }).getAttribute('href'),
    ).toBe(BACKGROUNDS_SOURCE.projectUrl);
    expect(screen.getByRole('link', { name: 'descargas de la versión 51' }).getAttribute('href')).toBe(
      BACKGROUNDS_SOURCE.releaseUrl,
    );
    expect(screen.getByText(/1920 × 1200 apaisado, 900 × 1600 vertical, 160 × 120/)).toBeTruthy();
  });

  it('las miniaturas son decorativas: el nombre ya está en el encabezado', async () => {
    await renderCredits();

    const images = screen.getByRole('main').querySelectorAll('img');
    expect(images).toHaveLength(BACKGROUNDS.length);
    images.forEach((image) => {
      expect(image.getAttribute('alt')).toBe('');
      expect(image.getAttribute('loading')).toBe('lazy');
    });
  });

  it('sin sesión vuelve al login', async () => {
    await renderCredits();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' }).getAttribute('href')).toBe('/login');
  });

  it('con sesión vuelve al admin', async () => {
    await renderCredits({ signedIn: true });
    expect(screen.getByRole('link', { name: 'Volver al admin' }).getAttribute('href')).toBe('/posts');
  });
});
