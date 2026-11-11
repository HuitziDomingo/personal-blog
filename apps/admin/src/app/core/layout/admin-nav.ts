import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileText,
  lucideLogOut,
  lucideMonitor,
  lucideMoon,
  lucidePalette,
  lucideSquarePen,
  lucideSun,
  lucideUser,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';

import { SessionService } from '../session/session.service';
import { ACCENT_LABELS, ACCENTS, isAccent, isThemeMode, THEME_MODE_LABELS, THEME_MODES, ThemeMode } from '../theme/theme';
import { ThemeService } from '../theme/theme.service';

/**
 * Contenido del menú: navegación y perfil (email, cerrar sesión y apariencia).
 * El shell lo pinta en la barra lateral en escritorio y en el offcanvas en
 * móvil y tablet, nunca en los dos a la vez: así los ids y los `name` de los
 * radios no se repiten.
 */
@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink, RouterLinkActive, NgIcon, HlmButtonImports, HlmLabelImports, HlmRadioGroupImports],
  providers: [
    provideIcons({ lucideFileText, lucideLogOut, lucideMonitor, lucideMoon, lucidePalette, lucideSquarePen, lucideSun, lucideUser }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    <nav aria-label="Principal">
      <ul class="flex flex-col gap-1">
        @for (link of links; track link.path) {
          <li>
            <a
              class="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-ring/50 flex h-9 items-center gap-2 rounded-md border-s-4 border-transparent px-3 text-sm font-medium outline-none focus-visible:ring-3"
              [routerLink]="link.path"
              routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground !border-sidebar-primary"
              [routerLinkActiveOptions]="exactPath"
              ariaCurrentWhenActive="page"
              ><ng-icon [name]="link.icon" size="1rem" aria-hidden="true" />{{ link.label }}</a
            >
          </li>
        }
      </ul>
    </nav>

    <section aria-labelledby="perfil-titulo" class="flex flex-col gap-4 border-t pt-4">
      <!-- Sin text-muted-foreground: el menú también va sobre el glass del
           offcanvas, donde no cumple AA (scripts/check-theme-contrast.mjs). -->
      <h2 id="perfil-titulo" class="flex items-center gap-2 px-3 text-xs font-semibold tracking-wide uppercase">
        <ng-icon name="lucideUser" size="0.875rem" aria-hidden="true" />Perfil
      </h2>

      <div class="flex flex-col gap-2 px-3">
        <p class="truncate text-sm font-medium" [title]="email() ?? ''">{{ email() }}</p>
        <button hlmBtn variant="outline" size="sm" type="button" [disabled]="loggingOut()" (click)="logout()">
          <ng-icon name="lucideLogOut" aria-hidden="true" />Cerrar sesión
        </button>
      </div>

      <div class="flex flex-col gap-4 px-3">
        <h3 class="flex items-center gap-2 text-sm font-semibold">
          <ng-icon name="lucidePalette" size="1rem" aria-hidden="true" />Apariencia
        </h3>

        <div class="flex flex-col gap-2">
          <span id="tema-titulo" class="text-xs font-semibold">Tema</span>
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
                <ng-icon [name]="modeIcons[mode]" size="1rem" aria-hidden="true" />
                {{ modeLabels[mode] }}
              </label>
            }
          </hlm-radio-group>
        </div>

        <div class="flex flex-col gap-2">
          <span id="acento-titulo" class="text-xs font-semibold">Color de acento</span>
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
  private readonly router = inject(Router);

  protected readonly links = [
    { path: '/posts', label: 'Posts', icon: 'lucideFileText' },
    { path: '/posts/new', label: 'Nuevo post', icon: 'lucideSquarePen' },
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
  // Aquí y no en theme.ts, que no importa nada (lo leen los scripts con Node).
  protected readonly modeIcons: Readonly<Record<ThemeMode, string>> = {
    light: 'lucideSun',
    dark: 'lucideMoon',
    system: 'lucideMonitor',
  };
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

  /**
   * Primero sale de la pantalla actual y después cierra la sesión. Si el
   * editor tiene cambios sin guardar y el usuario decide quedarse, el guard
   * cancela la navegación y la sesión sigue abierta.
   */
  protected async logout(): Promise<void> {
    this.loggingOut.set(true);
    // 'reload': desde /posts la navegación no se ignora (resolvería false).
    const left = await this.router.navigateByUrl('/posts', { onSameUrlNavigation: 'reload' });
    if (left === false) {
      this.loggingOut.set(false);
      return;
    }
    this.session.logout().subscribe();
  }
}
