import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { finalize } from 'rxjs';

import { problemMessage } from '../../../core/http/problem-messages';
import { AppBackdrop } from '../../../core/layout/app-backdrop';
import { BackgroundService } from '../../../core/theme/background.service';
import { safeReturnUrl } from '../../../core/session/return-url';
import { SessionService } from '../../../core/session/session.service';

/**
 * Pantalla de inicio de sesión. Tras el login vuelve a `returnUrl`, que llega
 * como query param, o a `/` (la lista de posts).
 */
@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    AppBackdrop,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center p-4' },
  styleUrl: './login.page.css',
  template: `
    <app-backdrop [background]="backgrounds.loginBackground" [variant]="backgrounds.variant()" />

    <section hlmCard class="glass-card w-full max-w-sm">
      <div hlmCardHeader>
        <h1 hlmCardTitle>Iniciar sesión</h1>
        <p hlmCardDescription class="login-muted">Panel de administración de huitzi.xyz</p>
      </div>

      <form hlmCardContent [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div hlmFieldGroup>
          <div hlmField>
            <label hlmFieldLabel for="email">Email</label>
            <input hlmInput id="email" type="email" autocomplete="username" formControlName="email" />
            <hlm-field-error class="login-error" validator="required">Escribe tu email.</hlm-field-error>
            <hlm-field-error class="login-error" validator="email">El email no es válido.</hlm-field-error>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="password">Contraseña</label>
            <input
              hlmInput
              id="password"
              type="password"
              autocomplete="current-password"
              formControlName="password"
            />
            <hlm-field-error class="login-error" validator="required">Escribe tu contraseña.</hlm-field-error>
          </div>

          @if (errorMessage(); as message) {
            <p role="alert" class="login-error text-sm">{{ message }}</p>
          }

          <button hlmBtn type="submit" class="w-full" [disabled]="pending()">Entrar</button>
        </div>
      </form>

      <div hlmCardFooter>
        <!-- Un solo link a la atribución de todos los fondos (CC BY-SA 3.0, BLOG-130). -->
        <a
          routerLink="/creditos"
          class="login-muted focus-visible:ring-ring/50 rounded-sm text-xs underline underline-offset-2 outline-none focus-visible:ring-3"
          >Créditos<span class="sr-only"> de los fondos de pantalla</span></a
        >
      </div>
    </section>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly backgrounds = inject(BackgroundService);

  /** Query param `returnUrl`, enlazado por `withComponentInputBinding`. */
  readonly returnUrl = input<string>();

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly pending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }

    this.pending.set(true);
    this.errorMessage.set(null);

    this.session
      .login(this.form.getRawValue())
      .pipe(
        finalize(() => this.pending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
        error: (error: unknown) => this.errorMessage.set(problemMessage(error, 'login')),
      });
  }
}
