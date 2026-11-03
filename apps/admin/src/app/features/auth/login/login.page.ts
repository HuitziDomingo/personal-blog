import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';

/**
 * Pantalla de inicio de sesión. Por ahora solo valida el formulario; el envío a
 * la API, la sesión y la redirección llegan con BLOG-016.
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

          <button hlmBtn type="submit" class="w-full">Entrar</button>
        </div>
      </form>
    </section>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  /** Último envío válido; BLOG-016 lo reemplaza por la llamada a la API. */
  protected readonly submitted = signal(false);

  protected submit(): void {
    this.form.markAllAsTouched();
    this.submitted.set(this.form.valid);
  }
}
