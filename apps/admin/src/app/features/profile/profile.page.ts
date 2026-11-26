import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideKeyRound, lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { finalize } from 'rxjs';

import { PasswordApi } from '../../core/api/password-api';
import { ApiError } from '../../core/http/api-error';
import { SessionService } from '../../core/session/session.service';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, passwordStrength, StrengthLevel, utf8Length } from './password-strength';

type SubmitState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'done' } | { kind: 'error'; message: string };

/** Largo en caracteres (no en unidades UTF-16), como la API. */
const minChars: ValidatorFn = (control) =>
  [...(control.value as string)].length < MIN_PASSWORD_LENGTH && control.value !== '' ? { minChars: true } : null;

const maxBytes: ValidatorFn = (control) =>
  utf8Length(control.value as string) > MAX_PASSWORD_BYTES ? { maxBytes: true } : null;

/** El control debe ser igual (`same`) o distinto (`!same`) a su hermano `other`. */
function comparedTo(other: string, same: boolean, key: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const sibling = control.parent?.get(other);
    if (!sibling || control.value === '') {
      return null;
    }

    return (control.value === sibling.value) === same ? null : { [key]: true };
  };
}

// Colores del segmento lleno por nivel; los vacíos usan el borde.
const LEVEL_CLASSES: Readonly<Record<StrengthLevel, string>> = {
  0: 'bg-destructive',
  1: 'bg-destructive',
  2: 'bg-amber-500',
  3: 'bg-emerald-600',
  4: 'bg-emerald-600',
};

/**
 * Perfil del admin: por ahora, cambiar la contraseña (ADR-032). Al cambiarla,
 * la API cierra la sesión en todos los dispositivos y abre una nueva en este.
 */
@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, HlmButtonImports, HlmFieldImports, HlmInputImports, NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck, lucideKeyRound, lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass-card mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">Perfil</h1>
      <p class="text-muted-foreground truncate text-sm">{{ email() }}</p>
    </header>

    <section aria-labelledby="password-title" class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 id="password-title" class="flex items-center gap-2 text-lg font-semibold">
          <ng-icon name="lucideKeyRound" aria-hidden="true" />Cambiar contraseña
        </h2>
        <p class="text-muted-foreground text-sm">
          Al cambiarla se cierra la sesión en tus otros dispositivos. En este navegador sigues dentro.
        </p>
      </div>

      <form class="max-w-md" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div hlmFieldGroup>
          <div hlmField>
            <label hlmFieldLabel for="current-password">Contraseña actual</label>
            <input
              hlmInput
              id="current-password"
              type="password"
              autocomplete="current-password"
              formControlName="currentPassword"
            />
            <hlm-field-error validator="required">Escribe tu contraseña actual.</hlm-field-error>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="new-password">Contraseña nueva</label>
            <input
              hlmInput
              id="new-password"
              type="password"
              autocomplete="new-password"
              formControlName="newPassword"
            />
            <p hlmFieldDescription id="new-password-rules">
              Al menos {{ minLength }} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.
            </p>

            @if (newPassword()) {
              <div class="flex flex-col gap-1" data-testid="password-strength">
                <div class="grid grid-cols-4 gap-1" aria-hidden="true">
                  @for (segment of segments; track segment) {
                    <span
                      class="h-1.5 rounded-full"
                      [class]="segment <= strength().level ? levelClass() : 'bg-border'"
                    ></span>
                  }
                </div>
              </div>
            }
            <!-- Siempre en el DOM para que la región viva funcione; solo anuncia
                 cuando cambia el nivel, no en cada tecla. Como descripción, el
                 campo lo enlaza en su aria-describedby. -->
            <p hlmFieldDescription id="new-password-strength" aria-live="polite" class="text-foreground empty:hidden">{{ strengthText() }}</p>

            <hlm-field-error validator="required">Escribe la contraseña nueva.</hlm-field-error>
            <hlm-field-error validator="minChars">Debe tener al menos {{ minLength }} caracteres.</hlm-field-error>
            <hlm-field-error validator="maxBytes"
              >Es demasiado larga: el máximo es {{ maxBytes }} bytes, y los acentos y emojis ocupan más de
              uno.</hlm-field-error
            >
            <hlm-field-error validator="unchanged">Debe ser distinta de la actual.</hlm-field-error>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="confirm-password">Repite la contraseña nueva</label>
            <input
              hlmInput
              id="confirm-password"
              type="password"
              autocomplete="new-password"
              formControlName="confirmPassword"
            />
            <hlm-field-error validator="required">Repite la contraseña nueva.</hlm-field-error>
            <hlm-field-error validator="mismatch">No coincide con la contraseña nueva.</hlm-field-error>
          </div>

          @if (submitError(); as message) {
            <div role="alert" class="border-destructive/40 bg-destructive/5 flex items-center gap-3 rounded-lg border p-3">
              <ng-icon name="lucideCircleAlert" class="text-destructive shrink-0" aria-hidden="true" />
              <p class="min-w-0 flex-1 text-sm">{{ message }}</p>
            </div>
          }

          <div>
            <button hlmBtn type="submit" [disabled]="saving()" [attr.aria-busy]="saving()">
              @if (saving()) {
                <ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Guardando…
              } @else {
                Cambiar contraseña
              }
            </button>
          </div>
        </div>
      </form>

      <!-- Región viva del resultado: role=status para no interrumpir. -->
      <p role="status" class="flex items-center gap-2 text-sm empty:hidden" data-testid="password-status">
        @if (state().kind === 'done') {
          <ng-icon name="lucideCircleCheck" aria-hidden="true" />Contraseña cambiada. Se cerró la sesión en tus otros
          dispositivos.
        }
      </p>
    </section>
  `,
})
export class ProfilePage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(PasswordApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly maxBytes = MAX_PASSWORD_BYTES;
  protected readonly segments = [1, 2, 3, 4] as const;

  protected readonly form = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, minChars, maxBytes, comparedTo('currentPassword', false, 'unchanged')]],
    confirmPassword: ['', [Validators.required, comparedTo('newPassword', true, 'mismatch')]],
  });

  protected readonly state = signal<SubmitState>({ kind: 'idle' });
  protected readonly saving = computed(() => this.state().kind === 'saving');
  protected readonly submitError = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : null;
  });

  protected readonly email = computed(() => this.session.user()?.email ?? '');

  protected readonly newPassword = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });
  protected readonly strength = computed(() => passwordStrength(this.newPassword()));
  protected readonly levelClass = computed(() => LEVEL_CLASSES[this.strength().level]);
  protected readonly strengthText = computed(() => (this.newPassword() ? `Fuerza: ${this.strength().label}` : ''));

  constructor() {
    // Las comparaciones dependen del otro campo: se revalidan cuando cambia.
    // Con eventos, para que los mensajes de error se actualicen; no hay
    // ciclo, porque nadie escucha los cambios de la confirmación.
    const { currentPassword, newPassword, confirmPassword } = this.form.controls;
    currentPassword.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => newPassword.updateValueAndValidity());
    newPassword.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => confirmPassword.updateValueAndValidity());
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) {
      return;
    }

    const { currentPassword, newPassword } = this.form.getRawValue();
    this.state.set({ kind: 'saving' });

    this.api
      .change({ currentPassword, newPassword })
      .pipe(
        finalize(() => {
          if (this.state().kind === 'saving') {
            this.state.set({ kind: 'idle' });
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          // Las contraseñas no se quedan en memoria del formulario.
          this.form.reset();
          this.state.set({ kind: 'done' });
        },
        error: (error: unknown) =>
          this.state.set({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'Error inesperado del servidor. Inténtalo de nuevo.',
          }),
      });
  }
}
