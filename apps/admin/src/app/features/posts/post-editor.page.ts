import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideArchiveRestore,
  lucideArrowLeft,
  lucideEyeOff,
  lucideSave,
  lucideSend,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { finalize, Observable, Subject, Subscription } from 'rxjs';

import { Post, PostStatus } from '../../core/api/api-types';
import { PostsApi } from '../../core/api/posts-api';
import { ApiError } from '../../core/http/api-error';
import { MarkdownEditor } from '../../shared/markdown-editor/markdown-editor';
import { POST_STATUS_LABELS } from './post-display';
import { createPostForm, formValueOf, isSlugEditable, POST_LIMITS, toPostWrite } from './post-form';

/** Valor del parámetro `:id` para crear un post. */
export const NEW_POST_ID = 'new';

type Action = { label: string; status: PostStatus; variant: 'default' | 'outline'; icon: string };

/** Aviso al guardar, según el estado anterior (null si es nuevo) y el nuevo. */
function savedNotice(before: PostStatus | null, after: PostStatus): string {
  if (after === 'published') {
    return before === 'published' ? 'Cambios guardados.' : 'Post publicado.';
  }
  if (after === 'draft') {
    if (before === 'published') return 'Post despublicado: ahora es un borrador.';
    if (before === 'archived') return 'Post restaurado como borrador.';
    return 'Borrador guardado.';
  }
  return 'Cambios guardados.';
}

const SLUG_CONFLICTS: Record<string, string> = {
  'slug already exists': 'Ese slug ya está en uso. Elige otro.',
  'slug cannot change once the post has been published':
    'El slug ya no se puede cambiar porque el post ya se publicó.',
};

/**
 * Crear (`/posts/new`) y editar (`/posts/:id`) un post. Las dos URLs usan esta
 * misma ruta, así que al crear Angular reutiliza el componente al pasar a
 * `/posts/:id` y no se pierde el aviso de guardado.
 */
@Component({
  selector: 'app-post-editor-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    MarkdownEditor,
    HlmAlertDialogImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucideArchive, lucideArchiveRestore, lucideArrowLeft, lucideEyeOff, lucideSave, lucideSend })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  template: `
    <header class="flex flex-wrap items-center gap-3">
      <a hlmBtn variant="ghost" size="sm" routerLink="/posts"><ng-icon name="lucideArrowLeft" aria-hidden="true" />Posts</a>
      <h1 #heading tabindex="-1" class="text-2xl font-semibold outline-none">
        {{ isNew() ? 'Nuevo post' : 'Editar post' }}
      </h1>
      @if (post(); as current) {
        <span hlmBadge [variant]="current.status === 'published' ? 'default' : current.status === 'draft' ? 'secondary' : 'outline'">
          {{ statusLabels[current.status] }}
        </span>
      }
    </header>

    <!-- Siempre en el DOM y nunca con display:none, para que se anuncie. -->
    <p role="status" class="text-sm">{{ notice() }}</p>

    @if (loading()) {
      <p class="text-muted-foreground text-sm">Cargando post…</p>
    } @else if (loadError(); as message) {
      <div role="alert" class="flex flex-wrap items-center gap-3">
        <p class="text-destructive text-sm">{{ message }}</p>
        <a hlmBtn variant="outline" size="sm" routerLink="/posts">Volver a la lista</a>
      </div>
    } @else {
      <form class="flex flex-col gap-6" [formGroup]="form" (ngSubmit)="save(primaryAction().status)" novalidate>
        @if (saveError(); as message) {
          <p role="alert" class="text-destructive text-sm">{{ message }}</p>
        }

        <div hlmFieldGroup>
          <div hlmField>
            <label hlmFieldLabel for="title">Título</label>
            <input hlmInput id="title" formControlName="title" [attr.maxlength]="limits.title" />
            <hlm-field-error validator="required">Escribe un título.</hlm-field-error>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="slug">Slug</label>
            <input
              hlmInput
              id="slug"
              formControlName="slug"
              autocomplete="off"
              spellcheck="false"
              [attr.maxlength]="limits.slug"
              [readonly]="!slugEditable()"
            />
            <p hlmFieldDescription>{{ slugHint() }}</p>
            <hlm-field-error validator="pattern">
              Usa solo minúsculas sin acentos, números y guiones entre palabras.
            </hlm-field-error>
            <hlm-field-error validator="server">{{ form.controls.slug.errors?.['server'] }}</hlm-field-error>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="excerpt">Extracto</label>
            <textarea hlmTextarea id="excerpt" formControlName="excerpt" [attr.maxlength]="limits.excerpt"></textarea>
            <p hlmFieldDescription>{{ excerptHint() }}</p>
          </div>

          <div hlmField>
            <label hlmFieldLabel for="tags">Etiquetas</label>
            <input hlmInput id="tags" formControlName="tags" autocomplete="off" />
            <p hlmFieldDescription>Separadas por comas. Hasta {{ limits.tags }}, de hasta {{ limits.tag }} caracteres.</p>
            <hlm-field-error validator="maxItems">Hay demasiadas etiquetas.</hlm-field-error>
            <hlm-field-error validator="maxItemLength">Alguna etiqueta es demasiado larga.</hlm-field-error>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <app-markdown-editor
            inputId="content"
            [value]="form.controls.content.value"
            [invalid]="contentInvalid()"
            [disabled]="saving()"
            [describedBy]="contentInvalid() ? 'content-error' : undefined"
            (valueChange)="setContent($event)"
            (touched)="form.controls.content.markAsTouched()"
          />
          @if (contentInvalid()) {
            <p id="content-error" role="alert" class="text-destructive text-sm">Escribe el contenido.</p>
          }
        </div>

        <fieldset hlmFieldSet formGroupName="seo">
          <legend hlmFieldLegend>SEO</legend>
          <div hlmFieldGroup>
            <div hlmField>
              <label hlmFieldLabel for="seo-title">Título para buscadores</label>
              <input hlmInput id="seo-title" formControlName="title" [attr.maxlength]="limits.seoTitle" />
            </div>
            <div hlmField>
              <label hlmFieldLabel for="seo-description">Descripción</label>
              <textarea hlmTextarea id="seo-description" formControlName="description" [attr.maxlength]="limits.seoDescription"></textarea>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="seo-keywords">Palabras clave</label>
              <input hlmInput id="seo-keywords" formControlName="keywords" autocomplete="off" />
              <p hlmFieldDescription>Separadas por comas. Hasta {{ limits.keywords }}.</p>
              <hlm-field-error validator="maxItems">Hay demasiadas palabras clave.</hlm-field-error>
              <hlm-field-error validator="maxItemLength">Alguna palabra clave es demasiado larga.</hlm-field-error>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="seo-canonical">URL canónica</label>
              <input hlmInput id="seo-canonical" type="url" formControlName="canonicalUrl" [attr.maxlength]="limits.url" />
              <hlm-field-error validator="url">Escribe una URL completa que empiece con https://.</hlm-field-error>
            </div>
            <div hlmField>
              <label hlmFieldLabel for="seo-og-image">URL de la imagen para redes</label>
              <input hlmInput id="seo-og-image" type="url" formControlName="ogImageUrl" [attr.maxlength]="limits.url" />
              <hlm-field-error validator="url">Escribe una URL completa que empiece con https://.</hlm-field-error>
            </div>
          </div>
        </fieldset>

        <div class="flex flex-wrap gap-2">
          @for (action of actions(); track action.status) {
            <button
              hlmBtn
              [variant]="action.variant"
              [type]="action === primaryAction() ? 'submit' : 'button'"
              [disabled]="saving()"
              (click)="action === primaryAction() ? null : save(action.status)"
            >
              <ng-icon [name]="action.icon" aria-hidden="true" />{{ action.label }}
            </button>
          }
          @if (post() && post()!.status !== 'archived') {
            <button hlmBtn variant="destructive" type="button" class="ml-auto" [disabled]="saving()" (click)="archiveOpen.set(true)">
              <ng-icon name="lucideArchive" aria-hidden="true" />Archivar
            </button>
          }
        </div>
      </form>
    }

    <hlm-alert-dialog [state]="archiveOpen() ? 'open' : 'closed'" (closed)="archiveOpen.set(false)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal>
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>¿Archivar este post?</h2>
          <p hlmAlertDialogDescription>
            Dejará de verse en el blog.
            @if (form.dirty) {
              Los cambios sin guardar se perderán.
            }
          </p>
        </hlm-alert-dialog-header>
        @if (archiveError(); as message) {
          <p role="alert" class="text-destructive text-sm">{{ message }}</p>
        }
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel [disabled]="saving()">Cancelar</button>
          <button hlmAlertDialogAction variant="destructive" [disabled]="saving()" (click)="archive()">Archivar</button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>

    <hlm-alert-dialog [state]="leaveOpen() ? 'open' : 'closed'" (closed)="resolveLeave(false)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal>
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>¿Salir sin guardar?</h2>
          <p hlmAlertDialogDescription>Tienes cambios sin guardar en este post. Si sales, se perderán.</p>
        </hlm-alert-dialog-header>
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel>Seguir editando</button>
          <button hlmAlertDialogAction variant="destructive" (click)="resolveLeave(true)">Salir sin guardar</button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class PostEditorPage {
  private readonly api = inject(PostsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly contentEditor = viewChild(MarkdownEditor);

  /** Parámetro `:id` de la ruta, enlazado por `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly limits = POST_LIMITS;
  protected readonly statusLabels = POST_STATUS_LABELS;
  protected readonly form = createPostForm(inject(NonNullableFormBuilder));

  protected readonly post = signal<Post | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly archiveError = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly archiveOpen = signal(false);
  protected readonly leaveOpen = signal(false);
  private readonly contentState = signal({ invalid: false, touched: false });

  protected readonly isNew = computed(() => this.id() === NEW_POST_ID);
  protected readonly slugEditable = computed(() => isSlugEditable(this.post()));
  protected readonly slugHint = computed(() => {
    const post = this.post();
    if (!post) {
      return 'Opcional. Si lo dejas vacío, se genera del título.';
    }
    if (post.publishedAt) {
      return 'No se puede cambiar: el post ya se publicó y cambiarlo rompería sus links.';
    }
    if (post.status !== 'draft') {
      return 'Solo se puede cambiar en un borrador. Restaura el post como borrador para editarlo.';
    }
    return 'Si lo dejas vacío, se conserva el actual.';
  });
  // La API guarda el extracto generado igual que uno escrito: una vez guardado,
  // ya no se regenera al cambiar el contenido, salvo que se vacíe el campo.
  protected readonly excerptHint = computed(() =>
    this.post()
      ? 'Si lo vacías, se vuelve a generar del contenido al guardar. Si no, se conserva aunque cambies el contenido.'
      : 'Opcional. Si lo dejas vacío, se genera del contenido al guardar.',
  );
  protected readonly contentInvalid = computed(() => this.contentState().invalid && this.contentState().touched);

  /** Acciones según el estado guardado. La primera es la del Enter. */
  protected readonly actions = computed<Action[]>(() => {
    switch (this.post()?.status) {
      case 'published':
        return [
          { label: 'Guardar cambios', status: 'published', variant: 'default', icon: 'lucideSave' },
          { label: 'Despublicar', status: 'draft', variant: 'outline', icon: 'lucideEyeOff' },
        ];
      case 'archived':
        return [
          { label: 'Restaurar como borrador', status: 'draft', variant: 'default', icon: 'lucideArchiveRestore' },
          { label: 'Publicar', status: 'published', variant: 'outline', icon: 'lucideSend' },
        ];
      default:
        return [
          { label: 'Guardar borrador', status: 'draft', variant: 'default', icon: 'lucideSave' },
          { label: 'Publicar', status: 'published', variant: 'outline', icon: 'lucideSend' },
        ];
    }
  });
  protected readonly primaryAction = computed(() => this.actions()[0]);

  private leaveDecision: Subject<boolean> | null = null;
  private loadSubscription: Subscription | null = null;

  constructor() {
    const content = this.form.controls.content;
    content.events.pipe(takeUntilDestroyed()).subscribe(() =>
      this.contentState.set({ invalid: content.invalid, touched: content.touched }),
    );

    // Carga el post cuando cambia el :id, salvo que ya sea el que se acaba de
    // crear (al pasar de /posts/new a /posts/:id).
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id === NEW_POST_ID) {
          this.loadSubscription?.unsubscribe();
          this.loading.set(false);
          this.loadError.set(null);
          this.notice.set('');
          this.reset(null);
        } else if (this.post()?.id !== id) {
          this.load(id);
        }
      });
    });
  }

  /** Para el guard de cambios sin guardar. */
  hasUnsavedChanges(): boolean {
    // El editor avisa con debounce: lo escrito en los últimos 200 ms todavía
    // no llegó al formulario.
    this.contentEditor()?.flush();
    // Mientras se guarda también: salir cancelaría la petición y no se sabría
    // si el post quedó guardado.
    return this.form.dirty || this.saving();
  }

  /** Pregunta antes de salir con cambios sin guardar. */
  confirmLeave(): Observable<boolean> {
    this.leaveDecision?.next(false);
    this.leaveDecision = new Subject<boolean>();
    this.leaveOpen.set(true);
    return this.leaveDecision.asObservable();
  }

  protected resolveLeave(leave: boolean): void {
    const decision = this.leaveDecision;
    this.leaveDecision = null;
    this.leaveOpen.set(false);
    if (decision) {
      decision.next(leave);
      decision.complete();
    }
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected setContent(value: string): void {
    this.form.controls.content.setValue(value);
    this.form.controls.content.markAsDirty();
  }

  protected save(status: PostStatus): void {
    // El editor avisa con debounce: sin esto se guardaría sin lo escrito en
    // los últimos 200 ms.
    this.contentEditor()?.flush();
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) {
      if (this.form.invalid) {
        this.saveError.set('Revisa los campos marcados.');
      }
      return;
    }

    const current = this.post();
    const body = toPostWrite(this.form.getRawValue(), status, this.slugEditable());
    const request = current ? this.api.update(current.id, body) : this.api.create(body);

    this.saving.set(true);
    this.saveError.set(null);
    this.notice.set('');
    // El formulario no se edita mientras se guarda: la respuesta lo reemplaza
    // con lo guardado y se perdería lo escrito entretanto.
    this.form.disable({ emitEvent: false });
    // Se vuelve a habilitar antes de mostrar errores: enable() valida de nuevo
    // y borraría el error `server` del slug.
    const done = () => {
      this.form.enable({ emitEvent: false });
      this.saving.set(false);
    };

    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          done();
          this.reset(saved);
          this.notice.set(savedNotice(current?.status ?? null, saved.status));
          if (!current) {
            void this.router.navigate(['/posts', saved.id], { replaceUrl: true });
          }
        },
        error: (error: unknown) => {
          done();
          this.showSaveError(error);
        },
      });
  }

  protected archive(): void {
    const current = this.post();
    if (!current || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.archiveError.set(null);

    this.api
      .archive(current.id)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.archiveOpen.set(false);
          // El usuario ya aceptó perder los cambios en el diálogo.
          this.form.markAsPristine();
          void this.router.navigate(['/posts'], { queryParams: { status: 'archived' } });
        },
        error: (error: unknown) => this.archiveError.set(messageOf(error)),
      });
  }

  private load(id: string): void {
    this.loadSubscription?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.notice.set('');

    this.loadSubscription = this.api
      .get(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (post) => this.reset(post),
        error: (error: unknown) => this.loadError.set(messageOf(error)),
      });
  }

  private reset(post: Post | null): void {
    this.post.set(post);
    this.saveError.set(null);
    if (post) {
      this.form.reset(formValueOf(post));
    } else {
      this.form.reset();
    }
  }

  private showSaveError(error: unknown): void {
    const apiError = error instanceof ApiError ? error : ApiError.from(error, 'post');

    if (apiError.status === 409) {
      const slug = this.form.controls.slug;
      slug.setErrors({ server: SLUG_CONFLICTS[apiError.detail ?? ''] ?? apiError.message });
      slug.markAsTouched();
      document.getElementById('slug')?.focus();
      return;
    }

    // Al crear sin slug, la API lo genera del título. Si el título no tiene
    // letras ni números con los que formarlo (por ejemplo, "¿?" o "日本語"),
    // responde 400: el formulario ya validó todo lo demás.
    if (apiError.status === 400 && !this.post() && this.form.controls.slug.value.trim() === '') {
      const slug = this.form.controls.slug;
      slug.setErrors({ server: 'No se pudo generar un slug con este título. Escribe uno.' });
      slug.markAsTouched();
      document.getElementById('slug')?.focus();
      return;
    }

    this.saveError.set(apiError.message);
    this.heading()?.nativeElement.focus();
  }
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : ApiError.from(error, 'post').message;
}
