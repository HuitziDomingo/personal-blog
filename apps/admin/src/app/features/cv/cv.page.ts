import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideDownload,
  lucideLoaderCircle,
  lucideRotateCw,
  lucideTriangleAlert,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import { CVLanguage, CVVersion } from '../../core/api/api-types';
import { CvApi } from '../../core/api/cv-api';
import { ApiError } from '../../core/http/api-error';
import { cvFileProblem, formatSize } from './cv-file';

/** Idiomas del CV, en el orden en que se muestran. */
export const CV_LANGUAGES: readonly CVLanguage[] = ['es', 'en'];

export const CV_LANGUAGE_LABELS: Readonly<Record<CVLanguage, string>> = { es: 'Español', en: 'Inglés' };

/** El aviso de ADR-028, punto 7, tal cual. */
export const CV_PUBLIC_WARNING = 'Este PDF será público. No incluyas tu teléfono ni datos privados.';

type ListState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

// El autor está en México: las fechas se leen en su zona.
const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

/**
 * CV en PDF (ADR-028, BLOG-138): subir el PDF de cada idioma, ver las versiones
 * y marcar la vigente, que es la que descarga la web.
 */
@Component({
  selector: 'app-cv-page',
  imports: [NgIcon, HlmButtonImports],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideDownload,
      lucideLoaderCircle,
      lucideRotateCw,
      lucideTriangleAlert,
      lucideUpload,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'glass-card mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">CV</h1>
      <p class="text-muted-foreground text-sm">
        Sube tu CV en PDF para cada idioma. La web ofrece descargar la versión vigente; sin una, no muestra el botón.
      </p>
    </header>

    <!-- Siempre visible, antes de los formularios: el aviso no depende de abrir nada. -->
    <div role="note" class="border-foreground/30 bg-background/60 flex items-start gap-3 rounded-lg border-2 p-3">
      <ng-icon name="lucideTriangleAlert" size="1.25rem" class="mt-0.5 shrink-0" aria-hidden="true" />
      <p class="text-sm font-semibold">{{ warning }}</p>
    </div>

    <!-- Una sola región viva, siempre en el DOM. -->
    <p role="status" class="text-sm empty:hidden">{{ notice() }}</p>

    <div class="grid gap-4 md:grid-cols-2">
      @for (language of languages; track language) {
        @let current = currentOf(language);
        <section class="flex flex-col gap-3 rounded-lg border p-4" [attr.aria-labelledby]="'cv-' + language + '-titulo'">
          <h2 [id]="'cv-' + language + '-titulo'" class="text-lg font-semibold">{{ labels[language] }}</h2>

          @if (current) {
            <p class="text-sm">
              Vigente: subido el {{ formatDate(current.uploadedAt) }} · {{ size(current.size) }}.
              <a
                class="focus-visible:ring-ring/50 rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-3"
                [href]="current.url"
                rel="noopener"
                [attr.aria-label]="'Descargar el PDF vigente en ' + labels[language].toLowerCase()"
                >Descargar</a
              >
            </p>
          } @else if (state().kind === 'ready') {
            <p class="text-sm">Sin PDF vigente: la web no muestra el botón de descarga.</p>
          }

          <form class="flex flex-col gap-2" (submit)="upload($event, language, fileInput)">
            <label class="text-sm font-medium" [for]="'cv-' + language + '-archivo'">PDF en {{ labels[language].toLowerCase() }}</label>
            <input
              #fileInput
              type="file"
              accept="application/pdf,.pdf"
              class="file:bg-secondary file:text-secondary-foreground focus-visible:ring-ring/50 pointer-coarse:min-h-11 min-h-9 rounded-md border px-2 py-1.5 text-sm outline-none file:me-3 file:rounded file:border-0 file:px-2 file:py-1 focus-visible:ring-3"
              [id]="'cv-' + language + '-archivo'"
              [attr.aria-describedby]="'cv-' + language + '-ayuda' + (problems()[language] ? ' cv-' + language + '-error' : '')"
              [attr.aria-invalid]="problems()[language] ? 'true' : null"
              (change)="clearProblem(language)"
            />
            <p [id]="'cv-' + language + '-ayuda'" class="text-muted-foreground text-xs">Solo PDF, hasta 2 MB. La versión nueva queda como vigente.</p>
            @if (problems()[language]; as problem) {
              <p [id]="'cv-' + language + '-error'" class="text-destructive flex items-center gap-1 text-sm font-medium">
                <ng-icon name="lucideCircleAlert" aria-hidden="true" />{{ problem }}
              </p>
            }
            <!-- aria-label empieza con el texto visible (WCAG 2.5.3) y dice el idioma. -->
            <button
              hlmBtn
              type="submit"
              class="self-start"
              [disabled]="uploading() === language"
              [attr.aria-label]="uploading() === language ? null : 'Subir PDF en ' + labels[language].toLowerCase()"
            >
              @if (uploading() === language) {
                <ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Subiendo…
              } @else {
                <ng-icon name="lucideUpload" aria-hidden="true" />Subir PDF
              }
            </button>
          </form>
        </section>
      }
    </div>

    <section class="flex flex-col gap-3" aria-labelledby="cv-versiones-titulo">
      <h2 id="cv-versiones-titulo" class="text-lg font-semibold">Versiones</h2>

      @switch (state().kind) {
        @case ('loading') {
          <p class="text-muted-foreground flex items-center gap-2 text-sm">
            <ng-icon name="lucideLoaderCircle" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />Cargando versiones…
          </p>
        }
        @case ('error') {
          <div role="alert" class="border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <ng-icon name="lucideCircleAlert" class="text-destructive" aria-hidden="true" />
            <p class="min-w-0 flex-1 text-sm">{{ errorMessage() }}</p>
            <button hlmBtn variant="outline" size="sm" type="button" (click)="load()">
              <ng-icon name="lucideRotateCw" aria-hidden="true" />Reintentar
            </button>
          </div>
        }
        @case ('ready') {
          @if (versions().length > 0) {
            <ul class="flex flex-col divide-y rounded-lg border" aria-labelledby="cv-versiones-titulo">
              @for (version of versions(); track version.id) {
                <li class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <p class="text-sm font-medium">
                      {{ labels[version.language] }}
                      @if (version.current) {
                        <span class="bg-primary text-primary-foreground ms-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                          ><ng-icon name="lucideCircleCheck" size="0.875rem" aria-hidden="true" />Vigente</span
                        >
                      }
                    </p>
                    <p class="text-muted-foreground text-xs">{{ formatDate(version.uploadedAt) }} · {{ size(version.size) }}</p>
                  </div>
                  <a
                    hlmBtn
                    variant="outline"
                    size="sm"
                    [href]="version.url"
                    rel="noopener"
                    [attr.aria-label]="'Descargar la versión en ' + labels[version.language].toLowerCase() + ' del ' + formatDate(version.uploadedAt)"
                    ><ng-icon name="lucideDownload" aria-hidden="true" />Descargar</a
                  >
                  @if (!version.current) {
                    <button
                      hlmBtn
                      variant="secondary"
                      size="sm"
                      type="button"
                      [disabled]="settingCurrent() === version.id"
                      [attr.aria-label]="'Marcar como vigente la versión en ' + labels[version.language].toLowerCase() + ' del ' + formatDate(version.uploadedAt)"
                      (click)="setCurrent(version)"
                    >
                      Marcar como vigente
                    </button>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm">Todavía no subiste ningún PDF.</p>
          }
        }
      }
    </section>
  `,
})
export class CvPage {
  private readonly api = inject(CvApi);

  protected readonly languages = CV_LANGUAGES;
  protected readonly labels = CV_LANGUAGE_LABELS;
  protected readonly warning = CV_PUBLIC_WARNING;

  protected readonly state = signal<ListState>({ kind: 'loading' });
  protected readonly versions = signal<CVVersion[]>([]);
  protected readonly notice = signal('');
  protected readonly problems = signal<Partial<Record<CVLanguage, string>>>({});
  protected readonly uploading = signal<CVLanguage | null>(null);
  protected readonly settingCurrent = signal<string | null>(null);

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.list().subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.state.set({ kind: 'ready' });
      },
      error: (error: unknown) => this.state.set({ kind: 'error', message: messageOf(error) }),
    });
  }

  protected currentOf(language: CVLanguage): CVVersion | undefined {
    return this.versions().find((version) => version.language === language && version.current);
  }

  protected clearProblem(language: CVLanguage): void {
    this.problems.update((problems) => ({ ...problems, [language]: undefined }));
  }

  protected upload(event: Event, language: CVLanguage, input: HTMLInputElement): void {
    event.preventDefault();
    const file = input.files?.[0] ?? null;
    const problem = cvFileProblem(file);
    if (problem || !file) {
      this.problems.update((problems) => ({ ...problems, [language]: problem ?? undefined }));
      input.focus();
      return;
    }

    this.clearProblem(language);
    this.uploading.set(language);
    this.notice.set('');
    this.api.upload(language, file).subscribe({
      next: () => {
        this.uploading.set(null);
        input.value = '';
        this.notice.set(`PDF en ${this.labels[language].toLowerCase()} subido; ya es el vigente.`);
        this.load();
      },
      error: (error: unknown) => {
        this.uploading.set(null);
        this.problems.update((problems) => ({ ...problems, [language]: messageOf(error) }));
        input.focus();
      },
    });
  }

  protected setCurrent(version: CVVersion): void {
    this.settingCurrent.set(version.id);
    this.notice.set('');
    this.api.setCurrent(version.id).subscribe({
      next: () => {
        this.settingCurrent.set(null);
        this.notice.set(`La versión en ${this.labels[version.language].toLowerCase()} del ${this.formatDate(version.uploadedAt)} es la vigente.`);
        this.load();
      },
      error: (error: unknown) => {
        this.settingCurrent.set(null);
        this.notice.set(messageOf(error));
      },
    });
  }

  protected formatDate(iso: string): string {
    return DATE_FORMAT.format(new Date(iso));
  }

  protected size(bytes: number): string {
    return formatSize(bytes);
  }
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Error inesperado. Inténtalo de nuevo.';
}
