import { ChangeDetectionStrategy, Component, effect, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMenu, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSheet, HlmSheetImports } from '@spartan-ng/helm/sheet';
import { filter } from 'rxjs';

import { injectMediaQuery } from '../browser/match-media';
import { AdminNav } from './admin-nav';

/** Ancho desde el que el menú es una barra lateral fija: `lg` de Tailwind (64rem). */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Layout de las pantallas con sesión: barra superior, menú y contenido. En
 * escritorio el menú es una barra lateral fija; en móvil y tablet, un
 * offcanvas (Sheet de Spartan) que se abre con el botón de la barra.
 *
 * El Sheet trae el overlay del CDK, así que el shell se carga por ruta y el
 * login no lo descarga.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterOutlet, NgIcon, HlmButtonImports, HlmSheetImports, AdminNav],
  providers: [provideIcons({ lucideMenu, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col' },
  template: `
    <a
      href="#contenido"
      class="bg-background focus-visible:ring-ring/50 sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus-visible:ring-3"
      (click)="skipToContent($event)"
      >Saltar al contenido</a
    >

    <header
      class="bg-background/80 supports-backdrop-filter:backdrop-blur-md sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4"
    >
      @if (!isDesktop()) {
        <hlm-sheet side="left">
          <button hlmSheetTrigger hlmBtn variant="ghost" size="icon" type="button" aria-label="Abrir menú">
            <ng-icon name="lucideMenu" aria-hidden="true" />
          </button>
          <hlm-sheet-content
            *hlmSheetPortal="let ctx"
            class="bg-background/80 supports-backdrop-filter:backdrop-blur-md w-72 overflow-y-auto p-4"
            [showCloseButton]="false"
          >
            <div class="flex items-center justify-between">
              <h2 hlmSheetTitle class="text-base font-semibold">Menú</h2>
              <button hlmSheetClose hlmBtn variant="ghost" size="icon-sm" type="button" aria-label="Cerrar menú">
                <ng-icon name="lucideX" aria-hidden="true" />
              </button>
            </div>
            <app-admin-nav />
          </hlm-sheet-content>
        </hlm-sheet>
      }
      <a routerLink="/posts" class="focus-visible:ring-ring/50 rounded-md font-semibold outline-none focus-visible:ring-3">
        huitzi.xyz <span class="text-muted-foreground font-normal">· Admin</span>
      </a>
    </header>

    <div class="flex min-h-0 flex-1">
      @if (isDesktop()) {
        <aside
          aria-label="Menú"
          class="bg-sidebar text-sidebar-foreground sticky top-14 h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto border-e p-4"
        >
          <app-admin-nav />
        </aside>
      }
      <main id="contenido" tabindex="-1" class="min-w-0 flex-1 outline-none">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminShell {
  protected readonly isDesktop = injectMediaQuery(DESKTOP_QUERY);
  private readonly sheet = viewChild(HlmSheet);

  constructor() {
    // El offcanvas se cierra al navegar (un link del menú, cerrar sesión) y
    // desaparece al pasar a escritorio, donde el menú ya está a la vista.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.sheet()?.close());

    effect(() => {
      if (this.isDesktop()) {
        this.sheet()?.close();
      }
    });
  }

  /** El salto mueve el foco al contenido sin cambiar la URL (el router usaría el fragmento). */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('contenido')?.focus();
  }
}
