import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';

import { Post, PostWrite } from '../../core/api/api-types';
import { PostsApi } from '../../core/api/posts-api';
import { ASSISTANT_ENABLED, MetadataSuggestion, WritingAssistant } from '../../core/assistant/writing-assistant';
import { ApiError } from '../../core/http/api-error';
import { MarkdownEditor } from '../../shared/markdown-editor/markdown-editor';
import { FakeMarkdownEditor } from '../../shared/markdown-editor/markdown-editor-fake';
import { MILKDOWN_THEME_LOADER } from '../../shared/markdown-editor/milkdown-theme';
import { installMissingBrowserApis, paste } from '../../shared/markdown-editor/milkdown-test-support';
import { PostEditorPage } from './post-editor.page';
import { unsavedChangesGuard } from './unsaved-changes.guard';

const NOW = '2026-11-05T12:00:00.000Z';

function stored(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    authorId: 'a1',
    title: 'Hola mundo',
    slug: 'hola-mundo',
    excerpt: 'Extracto',
    content: '# Hola',
    tags: ['go'],
    status: 'draft',
    publishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    seo: {},
    ...overrides,
  };
}

function conflict(detail: string): ApiError {
  return ApiError.from(
    new HttpErrorResponse({ status: 409, error: { type: 'about:blank', title: 'Conflict', status: 409, detail } }),
    'post',
  );
}

/** Fake de PostsApi (ADR-015): guarda un post en memoria y registra las llamadas. */
class FakePostsApi {
  post: Post | null = null;
  created: PostWrite[] = [];
  updated: { id: string; body: PostWrite }[] = [];
  archived: string[] = [];
  nextError: ApiError | null = null;
  /** Si está, create y update responden cuando el test lo decide. */
  pendingSave: Subject<void> | null = null;

  get(id: string): Observable<Post> {
    if (this.nextError) return this.fail();
    return this.post?.id === id
      ? of(this.post)
      : throwError(() => ApiError.from(new HttpErrorResponse({ status: 404 }), 'post'));
  }

  create(body: PostWrite): Observable<Post> {
    this.created.push(body);
    if (this.nextError) return this.fail();
    return this.respond(() => (this.post = this.toPost('p-new', body, null)));
  }

  update(id: string, body: PostWrite): Observable<Post> {
    this.updated.push({ id, body });
    if (this.nextError) return this.fail();
    return this.respond(() => (this.post = this.toPost(id, body, this.post)));
  }

  private respond(save: () => Post): Observable<Post> {
    const pending = this.pendingSave;
    if (!pending) return of(save());
    return new Observable<Post>((subscriber) =>
      pending.subscribe(() => {
        subscriber.next(save());
        subscriber.complete();
      }),
    );
  }

  archive(id: string): Observable<void> {
    this.archived.push(id);
    if (this.nextError) return this.fail();
    return of(undefined);
  }

  private fail(): Observable<never> {
    const error = this.nextError!;
    this.nextError = null;
    return throwError(() => error);
  }

  // Imita las reglas del service: slug generado o conservado, tags en
  // minúsculas y sin repetir, PublishedAt solo la primera vez.
  private toPost(id: string, body: PostWrite, previous: Post | null): Post {
    const tags = [...new Set((body.tags ?? []).map((tag) => tag.toLowerCase()))];
    const publishedAt = previous?.publishedAt ?? (body.status === 'published' ? NOW : null);
    return {
      id,
      authorId: 'a1',
      title: body.title,
      slug: body.slug ?? previous?.slug ?? 'generado-del-titulo',
      excerpt: body.excerpt || 'generado',
      content: body.content,
      tags,
      status: body.status,
      publishedAt,
      createdAt: previous?.createdAt ?? NOW,
      updatedAt: NOW,
      seo: body.seo ?? {},
    };
  }
}

async function renderEditor(api: FakePostsApi, id: string, extraProviders: unknown[] = []) {
  const result = await render(PostEditorPage, {
    inputs: { id },
    providers: [provideRouter([]), { provide: PostsApi, useValue: api }, ...(extraProviders as [])],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  await result.fixture.whenStable();

  return { ...result, navigate, page: result.fixture.componentInstance };
}

async function type(label: string, value: string) {
  await fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

describe('PostEditorPage', () => {
  // El editor real (Milkdown) se prueba en sus propios specs y en el E2E: aquí
  // basta un fake con su misma interfaz (ADR-015).
  beforeEach(() => {
    TestBed.overrideComponent(PostEditorPage, {
      remove: { imports: [MarkdownEditor] },
      add: { imports: [FakeMarkdownEditor] },
    });
  });

  describe('nuevo post', () => {
    it('muestra el formulario vacío, con el slug opcional y sin archivar', async () => {
      await renderEditor(new FakePostsApi(), 'new');

      expect(screen.getByRole('heading', { name: 'Nuevo post' })).toBeTruthy();
      expect(screen.getByText('Opcional. Si lo dejas vacío, se genera del título.')).toBeTruthy();
      expect(screen.getByLabelText('Slug').hasAttribute('readonly')).toBe(false);
      expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
    });

    it('no envía un formulario inválido y marca los campos', async () => {
      const api = new FakePostsApi();
      await renderEditor(api, 'new');

      await type('Slug', 'Con Mayúsculas');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(api.created).toEqual([]);
      expect(screen.getByText('Revisa los campos marcados.')).toBeTruthy();
      expect(screen.getByText('Escribe un título.')).toBeTruthy();
      expect(screen.getByText('Escribe el contenido.')).toBeTruthy();
      expect(screen.getByText('Usa solo minúsculas sin acentos, números y guiones entre palabras.')).toBeTruthy();
      expect(screen.getByLabelText('Contenido').getAttribute('aria-invalid')).toBe('true');
    });

    it('guarda un borrador sin slug, va a la URL del post y avisa', async () => {
      const api = new FakePostsApi();
      const { navigate, fixture, page } = await renderEditor(api, 'new');

      await type('Título', '  Mi primer post  ');
      await type('Contenido', '# Hola\n\nTexto');
      await type('Etiquetas', 'Go, IA ,');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(api.created).toEqual([
        { title: 'Mi primer post', content: '# Hola\n\nTexto', status: 'draft', excerpt: '', tags: ['Go', 'IA'] },
      ]);
      expect(navigate).toHaveBeenCalledWith(['/posts', 'p-new'], { replaceUrl: true });
      expect(page.hasUnsavedChanges()).toBe(false);

      // La ruta reutiliza el componente: el :id nuevo no vuelve a cargar el post.
      const get = vi.spyOn(api, 'get');
      fixture.componentRef.setInput('id', 'p-new');
      await fixture.whenStable();
      expect(get).not.toHaveBeenCalled();
      expect(screen.getByRole('status').textContent).toBe('Borrador guardado.');
      expect(screen.getByRole('heading', { name: 'Editar post' })).toBeTruthy();
      expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('generado-del-titulo');
      // El formulario muestra lo que guardó la API, no lo que se escribió.
      expect((screen.getByLabelText('Etiquetas') as HTMLInputElement).value).toBe('go, ia');
      expect(screen.getByText('Si lo vacías, se vuelve a generar del contenido al guardar. Si no, se conserva aunque cambies el contenido.')).toBeTruthy();
    });

    it('al crear de verdad con el router, pasa a /posts/:id con el mismo componente sin recargar', async () => {
      const api = new FakePostsApi();
      TestBed.configureTestingModule({
        providers: [
          provideRouter(
            [{ path: 'posts/:id', component: PostEditorPage, canDeactivate: [unsavedChangesGuard] }],
            withComponentInputBinding(),
          ),
          { provide: PostsApi, useValue: api },
        ],
      });
      const harness = await RouterTestingHarness.create();
      const page = await harness.navigateByUrl('/posts/new', PostEditorPage);
      const get = vi.spyOn(api, 'get');

      await type('Título', 'Hola');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/posts/p-new');
      expect(harness.routeDebugElement?.componentInstance).toBe(page);
      expect(get).not.toHaveBeenCalled();
      expect(screen.getByRole('status').textContent).toBe('Borrador guardado.');
    });

    it('mientras guarda, el formulario no se edita, no se envía dos veces y cuenta como cambio sin guardar', async () => {
      const api = new FakePostsApi();
      api.pendingSave = new Subject<void>();
      const { page } = await renderEditor(api, 'new');

      await type('Título', 'Hola');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(api.created).toHaveLength(1);
      expect(screen.getByLabelText('Título').hasAttribute('disabled')).toBe(true);
      expect(screen.getByLabelText('Contenido').hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Publicar' }).hasAttribute('disabled')).toBe(true);
      expect(page.hasUnsavedChanges()).toBe(true);

      api.pendingSave.next();
      await waitFor(() => expect(screen.getByLabelText('Título').hasAttribute('disabled')).toBe(false));
      expect(screen.getByLabelText('Contenido').hasAttribute('disabled')).toBe(false);
      expect(page.hasUnsavedChanges()).toBe(false);
    });

    it('un 400 al crear sin slug pide escribir uno en el campo', async () => {
      const api = new FakePostsApi();
      api.nextError = ApiError.from(
        new HttpErrorResponse({ status: 400, error: { detail: 'invalid post data' } }),
        'post',
      );
      await renderEditor(api, 'new');

      await type('Título', '¿?');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(screen.getByText('No se pudo generar un slug con este título. Escribe uno.')).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByLabelText('Slug'));
    });

    it('publica con un slug elegido', async () => {
      const api = new FakePostsApi();
      await renderEditor(api, 'new');

      await type('Título', 'Hola');
      await type('Slug', 'mi-slug');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

      expect(api.created[0]).toMatchObject({ slug: 'mi-slug', status: 'published' });
      expect(screen.getByRole('status').textContent).toBe('Post publicado.');
    });

    it('un 409 de slug duplicado se muestra en el campo', async () => {
      const api = new FakePostsApi();
      api.nextError = conflict('slug already exists');
      await renderEditor(api, 'new');

      await type('Título', 'Hola');
      await type('Slug', 'hola');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      const slug = screen.getByLabelText('Slug');
      expect(screen.getByText('Ese slug ya está en uso. Elige otro.')).toBeTruthy();
      expect(slug.getAttribute('aria-describedby')).toContain(screen.getByText('Ese slug ya está en uso. Elige otro.').closest('hlm-field-error')!.id);
      expect(document.activeElement).toBe(slug);

      // Al cambiar el slug, el error del servidor desaparece.
      await type('Slug', 'hola-2');
      expect(screen.queryByText('Ese slug ya está en uso. Elige otro.')).toBeNull();
    });

    it('un error que no es del slug se muestra arriba del formulario', async () => {
      const api = new FakePostsApi();
      api.nextError = ApiError.from(new HttpErrorResponse({ status: 500 }), 'post');
      await renderEditor(api, 'new');

      await type('Título', 'Hola');
      await type('Contenido', 'Texto');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(screen.getByRole('alert').textContent).toContain('Error inesperado del servidor.');
      expect(screen.getByRole('button', { name: 'Guardar borrador' }).hasAttribute('disabled')).toBe(false);
    });
  });

  describe('post existente', () => {
    it('carga el post en el formulario', async () => {
      const api = new FakePostsApi();
      api.post = stored({ seo: { title: 'SEO', keywords: ['a', 'b'] } });
      await renderEditor(api, 'p1');

      expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Hola mundo');
      expect((screen.getByLabelText('Etiquetas') as HTMLInputElement).value).toBe('go');
      expect((screen.getByLabelText('Contenido') as HTMLTextAreaElement).value).toBe('# Hola');
      expect((screen.getByLabelText('Palabras clave') as HTMLInputElement).value).toBe('a, b');
      expect(screen.getByText('Borrador')).toBeTruthy();
      expect(screen.getByText('Si lo dejas vacío, se conserva el actual.')).toBeTruthy();
    });

    // Que el editor emita cada tecla sin espera se prueba en sus specs; aquí,
    // que la página guarda lo último que recibió.
    it('guarda el contenido recibido del editor al instante', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      const { page } = await renderEditor(api, 'p1');

      await type('Contenido', '# Recién escrito');

      expect(page.hasUnsavedChanges()).toBe(true);
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
      expect(api.updated.at(-1)?.body.content).toBe('# Recién escrito');
    });

    it('un post que no existe muestra el error y vuelve a la lista', async () => {
      await renderEditor(new FakePostsApi(), 'no-existe');

      expect(screen.getByRole('alert').textContent).toContain('El post no existe o ya no está disponible.');
      expect(screen.getByRole('link', { name: 'Volver a la lista' }).getAttribute('href')).toBe('/posts');
      expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull();
    });

    it('pasar de un post que no existe a /posts/new muestra el formulario vacío', async () => {
      const { fixture } = await renderEditor(new FakePostsApi(), 'no-existe');

      fixture.componentRef.setInput('id', 'new');
      await fixture.whenStable();

      expect(screen.queryByRole('alert')).toBeNull();
      expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');
      expect(screen.getByRole('heading', { name: 'Nuevo post' })).toBeTruthy();
    });

    it('un borrador nunca publicado puede cambiar el slug y publicarse', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      await renderEditor(api, 'p1');

      await type('Slug', 'nuevo-slug');
      await fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

      expect(api.updated).toEqual([{ id: 'p1', body: expect.objectContaining({ slug: 'nuevo-slug', status: 'published' }) }]);
      expect(screen.getByText('Publicado')).toBeTruthy();
    });

    it('con PublishedAt, el slug es de solo lectura con la explicación y no se envía', async () => {
      const api = new FakePostsApi();
      api.post = stored({ status: 'published', publishedAt: NOW });
      await renderEditor(api, 'p1');

      const slug = screen.getByLabelText('Slug');
      expect(slug.hasAttribute('readonly')).toBe(true);
      expect(screen.getByText('No se puede cambiar: el post ya se publicó y cambiarlo rompería sus links.')).toBeTruthy();

      await type('Título', 'Otro título');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(api.updated[0].body.slug).toBeUndefined();
      expect(api.updated[0].body).toMatchObject({ title: 'Otro título', status: 'published' });
      expect(screen.getByRole('status').textContent).toBe('Cambios guardados.');
      expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('hola-mundo');
    });

    it('despublicar guarda como borrador y el slug sigue bloqueado', async () => {
      const api = new FakePostsApi();
      api.post = stored({ status: 'published', publishedAt: NOW });
      await renderEditor(api, 'p1');

      await fireEvent.click(screen.getByRole('button', { name: 'Despublicar' }));

      expect(api.updated[0].body.status).toBe('draft');
      expect(screen.getByRole('status').textContent).toBe('Post despublicado: ahora es un borrador.');
      expect(screen.getByText('Borrador')).toBeTruthy();
      expect(screen.getByLabelText('Slug').hasAttribute('readonly')).toBe(true);
      expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy();
    });

    it('un post archivado se puede restaurar como borrador o publicar', async () => {
      const api = new FakePostsApi();
      api.post = stored({ status: 'archived' });
      await renderEditor(api, 'p1');

      expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
      expect(screen.getByText('Solo se puede cambiar en un borrador. Restaura el post como borrador para editarlo.')).toBeTruthy();
      await fireEvent.click(screen.getByRole('button', { name: 'Restaurar como borrador' }));

      expect(api.updated[0].body.status).toBe('draft');
      expect(screen.getByRole('status').textContent).toBe('Post restaurado como borrador.');
    });

    it('un 409 de slug bloqueado se explica en el campo', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      await renderEditor(api, 'p1');
      api.nextError = conflict('slug cannot change once the post has been published');

      await type('Slug', 'otro');
      await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

      expect(screen.getByText('El slug ya no se puede cambiar porque el post ya se publicó.')).toBeTruthy();
    });

    it('archiva tras confirmar y vuelve a la lista de archivados', async () => {
      const api = new FakePostsApi();
      api.post = stored({ status: 'published', publishedAt: NOW });
      const { navigate, page } = await renderEditor(api, 'p1');

      await type('Título', 'Cambio sin guardar');
      await fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain('Los cambios sin guardar se perderán.');
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }));

      expect(api.archived).toEqual(['p1']);
      expect(page.hasUnsavedChanges()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/posts'], { queryParams: { status: 'archived' } });
    });
  });

  describe('cambios sin guardar', () => {
    it('sin cambios, el guard deja salir sin preguntar', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      const { page } = await renderEditor(api, 'p1');

      expect(TestBed.runInInjectionContext(() => unsavedChangesGuard(page, null!, null!, null!))).toBe(true);
    });

    it('con cambios, el guard pregunta en un diálogo y respeta la respuesta', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      const { page } = await renderEditor(api, 'p1');
      await type('Título', 'Editado');

      const stay = TestBed.runInInjectionContext(() => unsavedChangesGuard(page, null!, null!, null!)) as Observable<boolean>;
      const stayResult = firstValueFrom(stay);
      let dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByRole('heading', { name: '¿Salir sin guardar?' })).toBeTruthy();
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
      expect(await stayResult).toBe(false);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

      const leave = TestBed.runInInjectionContext(() => unsavedChangesGuard(page, null!, null!, null!)) as Observable<boolean>;
      const leaveResult = firstValueFrom(leave);
      dialog = await screen.findByRole('alertdialog');
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Salir sin guardar' }));
      expect(await leaveResult).toBe(true);
    });

    it('Escape en el diálogo de salida es quedarse', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      const { page } = await renderEditor(api, 'p1');
      await type('Título', 'Editado');

      const result = firstValueFrom(
        TestBed.runInInjectionContext(() => unsavedChangesGuard(page, null!, null!, null!)) as Observable<boolean>,
      );
      const dialog = await screen.findByRole('alertdialog');
      await fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

      expect(await result).toBe(false);
      expect(page.hasUnsavedChanges()).toBe(true);
    });

    it('escribir en el editor de contenido también cuenta como cambio', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      const { page } = await renderEditor(api, 'p1');

      expect(page.hasUnsavedChanges()).toBe(false);
      await type('Contenido', '# Otro');
      expect(page.hasUnsavedChanges()).toBe(true);
    });

    it('beforeunload avisa solo con cambios sin guardar', async () => {
      const api = new FakePostsApi();
      api.post = stored();
      await renderEditor(api, 'p1');

      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      await type('Título', 'Editado');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });

  describe('asistente', () => {
    it('no aparece con el flag apagado (producción)', async () => {
      await renderEditor(new FakePostsApi(), 'new', [{ provide: ASSISTANT_ENABLED, useValue: false }]);

      expect(screen.queryByRole('heading', { name: 'Asistente' })).toBeNull();
    });

    it('aplicar título, extracto y tags rellena el formulario', async () => {
      const metadata: MetadataSuggestion = { title: 'Título sugerido', excerpt: 'Extracto sugerido', tags: ['ia', 'go'] };
      const assistant: Partial<WritingAssistant> = { suggestMetadata: () => of(metadata) };
      await renderEditor(new FakePostsApi(), 'new', [{ provide: WritingAssistant, useValue: assistant }]);

      await fireEvent.click(screen.getByRole('button', { name: 'Sugerir título, extracto y tags' }));
      await fireEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));

      expect((screen.getByLabelText('Título', { exact: true }) as HTMLInputElement).value).toBe('Título sugerido');
      expect((screen.getByLabelText('Extracto') as HTMLTextAreaElement).value).toBe('Extracto sugerido');
      expect((screen.getByLabelText('Etiquetas') as HTMLInputElement).value).toBe('ia, go');
    });
  });
});

// Con Milkdown real: el editor avisa con debounce, así que la página tiene que
// pedirle lo pendiente antes de guardar o de decidir si hay cambios.
describe('PostEditorPage con el editor real', () => {
  beforeAll(installMissingBrowserApis);

  async function renderWithMilkdown(api: FakePostsApi, id: string) {
    const result = await render(PostEditorPage, {
      inputs: { id },
      providers: [
        provideRouter([]),
        { provide: PostsApi, useValue: api },
        // jsdom no carga hojas de estilo (ADR-015).
        { provide: MILKDOWN_THEME_LOADER, useValue: { load: () => Promise.resolve() } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await result.fixture.whenStable();
    const editor = await screen.findByRole('textbox', { name: 'Contenido' });

    return { ...result, editor, page: result.fixture.componentInstance };
  }

  it('guarda lo escrito justo antes de hacer clic, sin esperar el debounce', async () => {
    const api = new FakePostsApi();
    const { editor } = await renderWithMilkdown(api, 'new');

    await type('Título', 'Hola');
    paste(editor, { text: '# Recién escrito' });
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    expect(api.created[0]?.content).toBe('# Recién escrito\n');
  });

  it('lo escrito justo antes de salir cuenta como cambio sin guardar', async () => {
    const api = new FakePostsApi();
    api.post = stored();
    const { editor, page } = await renderWithMilkdown(api, 'p1');

    paste(editor, { text: ' más' });

    expect(page.hasUnsavedChanges()).toBe(true);
  });
});
