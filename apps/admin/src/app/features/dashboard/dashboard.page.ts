import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { SessionService } from '../../core/session/session.service';

/** Página protegida mínima; el layout del panel llega con BLOG-017. */
@Component({
  selector: 'app-dashboard-page',
  imports: [HlmButtonImports, HlmCardImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center p-4' },
  template: `
    <section hlmCard class="w-full max-w-sm">
      <div hlmCardHeader>
        <h1 hlmCardTitle>Panel</h1>
        <p hlmCardDescription>Sesión iniciada como {{ session.user()?.email }}</p>
      </div>

      <div hlmCardContent>
        <button hlmBtn type="button" class="w-full" [disabled]="loggingOut()" (click)="logout()">
          Cerrar sesión
        </button>
      </div>
    </section>
  `,
})
export class DashboardPage {
  protected readonly session = inject(SessionService);
  protected readonly loggingOut = signal(false);

  protected logout(): void {
    this.loggingOut.set(true);
    this.session.logout().subscribe();
  }
}
