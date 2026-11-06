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
import { Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { finalize } from 'rxjs';

import { problemMessage } from '../../../core/http/problem-messages';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center p-4' },
  template: `
    <section hlmCard class="w-full max-w-sm">
      <div hlmCardHeader>
        <h1 hlmCardTitle>Iniciar sesión</h1>
        <p hlmCardDescription>Panel de administración de huitzi.xyz</p>
      </div>

      <form hlmCardContent [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div hlmFieldGroup>
          <div hlmField>
            <label hlmFieldLabel for="email">Email</label>
            <input hlmInput id="email" type="email" autocomplete="username" formControlName="email" />
            <hlm-field-error validator="required">Escribe tu email.</hlm-field-error>
            <hlm-field-error validator="email">El email no es válido.</hlm-field-error>
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
            <hlm-field-error validator="required">Escribe tu contraseña.</hlm-field-error>
          </div>

          @if (errorMessage(); as message) {
            <p role="alert" class="text-destructive text-sm">{{ message }}</p>
          }

          <button hlmBtn type="submit" class="w-full" [disabled]="pending()">Entrar</button>
        </div>
      </form>
    </section>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

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
