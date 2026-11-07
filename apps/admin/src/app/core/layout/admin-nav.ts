import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';

import { SessionService } from '../session/session.service';
import { ACCENT_LABELS, ACCENTS, isAccent, isThemeMode, THEME_MODE_LABELS, THEME_MODES } from '../theme/theme';
import { ThemeService } from '../theme/theme.service';

/**
 * Contenido del menú: navegación y perfil (email, cerrar sesión y apariencia).
 * El shell lo pinta en la barra lateral en escritorio y en el offcanvas en
 * móvil y tablet, nunca en los dos a la vez: así los ids y los `name` de los
 * radios no se repiten.
 */
@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink, RouterLinkActive, HlmButtonImports, HlmLabelImports, HlmRadioGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    <nav aria-label="Principal">
      <ul class="flex flex-col gap-1">
        @for (link of links; track link.path) {
          <li>
            <a
              class="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 flex h-9 items-center rounded-md border-s-4 border-transparent px-3 text-sm font-medium outline-none focus-visible:ring-3"
              [routerLink]="link.path"
              routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground !border-sidebar-primary"
              [routerLinkActiveOptions]="exactPath"
              ariaCurrentWhenActive="page"
              >{{ link.label }}</a
            >
          </li>
        }
      </ul>
    </nav>

    <section aria-labelledby="perfil-titulo" class="flex flex-col gap-4 border-t pt-4">
      <h2 id="perfil-titulo" class="text-muted-foreground px-3 text-xs font-semibold tracking-wide uppercase">
        Perfil
      </h2>

      <div class="flex flex-col gap-2 px-3">
        <p class="truncate text-sm font-medium" [title]="email() ?? ''">{{ email() }}</p>
        <button hlmBtn variant="outline" size="sm" type="button" [disabled]="loggingOut()" (click)="logout()">
          Cerrar sesión
        </button>
      </div>

      <div class="flex flex-col gap-4 px-3">
        <h3 class="text-sm font-semibold">Apariencia</h3>

        <div class="flex flex-col gap-2">
          <span id="tema-titulo" class="text-muted-foreground text-xs font-medium">Tema</span>
          <hlm-radio-group
            name="tema"
            aria-labelledby="tema-titulo"
            class="gap-2"
            [value]="theme.mode()"
            (valueChange)="setMode($event)"
          >
            @for (mode of modes; track mode) {
              <label hlmLabel class="font-normal">
                <hlm-radio [value]="mode"><hlm-radio-indicator indicator /></hlm-radio>
                {{ modeLabels[mode] }}
              </label>
            }
          </hlm-radio-group>
        </div>

        <div class="flex flex-col gap-2">
          <span id="acento-titulo" class="text-muted-foreground text-xs font-medium">Color de acento</span>
          <hlm-radio-group
            name="acento"
            aria-labelledby="acento-titulo"
            class="grid-cols-2 gap-2"
            [value]="theme.accent()"
            (valueChange)="setAccent($event)"
          >
            @for (accent of accents; track accent) {
              <label hlmLabel class="font-normal">
                <hlm-radio [value]="accent"><hlm-radio-indicator indicator /></hlm-radio>
                <!-- Cada muestra lleva su propio data-accent: styles.css le
                     redefine --primary con su paleta, en claro y en oscuro. -->
                <span
                  aria-hidden="true"
                  class="bg-primary size-4 shrink-0 rounded-full border"
                  [attr.data-accent]="accent"
                ></span>
                {{ accentLabels[accent] }}
              </label>
            }
          </hlm-radio-group>
        </div>
      </div>
    </section>
  `,
})
export class AdminNav {
  protected readonly theme = inject(ThemeService);
  private readonly session = inject(SessionService);

  protected readonly links = [
    { path: '/posts', label: 'Posts' },
    { path: '/posts/new', label: 'Nuevo post' },
  ] as const;

  // Exacto en el path, pero sin mirar la query: /posts?status=draft sigue
  // marcando «Posts».
  protected readonly exactPath = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  } as const;

  protected readonly modes = THEME_MODES;
  protected readonly modeLabels = THEME_MODE_LABELS;
  protected readonly accents = ACCENTS;
  protected readonly accentLabels = ACCENT_LABELS;

  protected readonly email = computed(() => this.session.user()?.email ?? null);
  protected readonly loggingOut = signal(false);

  // El grupo de radios emite valores sin tipo: se validan antes de usarlos.
  protected setMode(mode: unknown): void {
    if (isThemeMode(mode)) {
      this.theme.setMode(mode);
    }
  }

  protected setAccent(accent: unknown): void {
    if (isAccent(accent)) {
      this.theme.setAccent(accent);
    }
  }

  protected logout(): void {
    this.loggingOut.set(true);
    this.session.logout().subscribe();
  }
}
