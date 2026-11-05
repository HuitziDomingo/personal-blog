package service

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const testAuthorID = "author-1"

// fakePostRepository guarda los posts en memoria y respeta la unicidad del
// slug como el índice de MongoDB. Devuelve copias para que el service no
// pueda cambiar el estado guardado sin llamar a Update.
type fakePostRepository struct {
	posts  map[string]*domain.Post
	nextID int

	// slugTakenConcurrently simula otra petición que guarda un post con ese
	// slug justo antes del insert: estaba libre al buscarlo y ya no lo está.
	slugTakenConcurrently func(slug string) bool

	createAttempts []string
	lastFilter     domain.PostFilter
}

func newFakePostRepository() *fakePostRepository {
	return &fakePostRepository{posts: map[string]*domain.Post{}}
}

func (f *fakePostRepository) Create(_ context.Context, post *domain.Post) error {
	f.createAttempts = append(f.createAttempts, post.Slug)

	if f.slugTakenConcurrently != nil && f.slugTakenConcurrently(post.Slug) {
		f.insert(&domain.Post{Slug: post.Slug, Status: domain.PostStatusDraft})

		return domain.ErrDuplicateSlug
	}

	if f.slugInUse(post.Slug, "") {
		return domain.ErrDuplicateSlug
	}

	post.ID = f.insert(post)

	return nil
}

func (f *fakePostRepository) GetByID(_ context.Context, id string) (*domain.Post, error) {
	post, ok := f.posts[id]
	if !ok {
		return nil, domain.ErrNotFound
	}

	return clonePost(post), nil
}

func (f *fakePostRepository) GetBySlug(_ context.Context, slug string) (*domain.Post, error) {
	for _, post := range f.posts {
		if post.Slug == slug {
			return clonePost(post), nil
		}
	}

	return nil, domain.ErrNotFound
}

// List registra el filtro y aplica status y tag. El orden y la paginación
// son del repositorio y se prueban en sus tests de integración.
func (f *fakePostRepository) List(_ context.Context, filter domain.PostFilter) ([]*domain.Post, int64, error) {
	f.lastFilter = filter

	posts := []*domain.Post{}

	for _, post := range f.posts {
		if filter.Status != "" && post.Status != filter.Status {
			continue
		}

		if filter.Tag != "" && !containsString(post.Tags, filter.Tag) {
			continue
		}

		posts = append(posts, clonePost(post))
	}

	return posts, int64(len(posts)), nil
}

func (f *fakePostRepository) Update(_ context.Context, post *domain.Post) error {
	stored, ok := f.posts[post.ID]
	if !ok {
		return domain.ErrNotFound
	}

	if f.slugInUse(post.Slug, post.ID) {
		return domain.ErrDuplicateSlug
	}

	updated := clonePost(post)
	updated.AuthorID = stored.AuthorID
	updated.CreatedAt = stored.CreatedAt
	f.posts[post.ID] = updated

	return nil
}

func (f *fakePostRepository) insert(post *domain.Post) string {
	f.nextID++
	id := "post-" + strconv.Itoa(f.nextID)

	stored := clonePost(post)
	stored.ID = id
	f.posts[id] = stored

	return id
}

func (f *fakePostRepository) slugInUse(slug, exceptID string) bool {
	for id, post := range f.posts {
		if post.Slug == slug && id != exceptID {
			return true
		}
	}

	return false
}

func clonePost(post *domain.Post) *domain.Post {
	clone := *post
	clone.Tags = append([]string(nil), post.Tags...)
	clone.SEO.Keywords = append([]string(nil), post.SEO.Keywords...)

	if post.PublishedAt != nil {
		publishedAt := *post.PublishedAt
		clone.PublishedAt = &publishedAt
	}

	return &clone
}

func containsString(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}

	return false
}

type postFixture struct {
	service *PostService
	posts   *fakePostRepository
	clock   *testClock
}

func newPostFixture() postFixture {
	posts := newFakePostRepository()
	clock := &testClock{now: time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)}

	return postFixture{service: NewPostService(posts, clock.Now), posts: posts, clock: clock}
}

func draftInput(title string) PostInput {
	return PostInput{Title: title, Content: "Contenido del post.", Status: domain.PostStatusDraft}
}

func withStatus(input PostInput, status domain.PostStatus) PostInput {
	input.Status = status
	return input
}

func withSlug(input PostInput, slug string) PostInput {
	input.Slug = slug
	return input
}

// createPost crea un post por el service y falla el test si no puede.
func (f postFixture) createPost(t *testing.T, input PostInput) *domain.Post {
	t.Helper()

	post, err := f.service.Create(t.Context(), testAuthorID, input)
	require.NoError(t, err)

	return post
}

func TestPostServiceCreate(t *testing.T) {
	f := newPostFixture()
	now := f.clock.Now()

	post := f.createPost(t, PostInput{
		Title:   "  Orquestación de agentes  ",
		Content: "# Intro\n\nLos **agentes** se coordinan.",
		Tags:    []string{" IA ", "Go", "ia"},
		Status:  domain.PostStatusDraft,
		SEO:     domain.SEO{Title: "SEO"},
	})

	assert.NotEmpty(t, post.ID)
	assert.Equal(t, testAuthorID, post.AuthorID)
	assert.Equal(t, "Orquestación de agentes", post.Title)
	assert.Equal(t, "orquestacion-de-agentes", post.Slug)
	assert.Equal(t, "Intro Los agentes se coordinan.", post.Excerpt)
	assert.Equal(t, []string{"ia", "go"}, post.Tags)
	assert.Equal(t, domain.SEO{Title: "SEO"}, post.SEO)
	assert.Nil(t, post.PublishedAt)
	assert.Equal(t, now, post.CreatedAt)
	assert.Equal(t, now, post.UpdatedAt)

	stored, err := f.posts.GetByID(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, post, stored)
}

func TestPostServiceCreatePublishedSetsPublishedAt(t *testing.T) {
	f := newPostFixture()

	post := f.createPost(t, withStatus(draftInput("Publicado"), domain.PostStatusPublished))

	require.NotNil(t, post.PublishedAt)
	assert.Equal(t, f.clock.Now(), *post.PublishedAt)
}

func TestPostServiceCreateKeepsContentAsIs(t *testing.T) {
	f := newPostFixture()
	content := "  <script>alert(1)</script>\n\n**Markdown** sin convertir.\n"

	input := draftInput("Contenido")
	input.Content = content

	post := f.createPost(t, input)
	assert.Equal(t, content, post.Content)
}

func TestPostServiceCreateExcerpt(t *testing.T) {
	tests := []struct {
		name    string
		excerpt string
		want    string
	}{
		{name: "empty is generated", excerpt: "", want: "Contenido del post."},
		{name: "blank is generated", excerpt: "   ", want: "Contenido del post."},
		{name: "sent is kept and trimmed", excerpt: "  Mi extracto **tal cual** ", want: "Mi extracto **tal cual**"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()
			input := draftInput("Extracto")
			input.Excerpt = tt.excerpt

			assert.Equal(t, tt.want, f.createPost(t, input).Excerpt)
		})
	}
}

func TestPostServiceCreateNormalizesTags(t *testing.T) {
	tests := []struct {
		name string
		tags []string
		want []string
	}{
		{name: "nil", tags: nil, want: []string{}},
		{name: "lowercase", tags: []string{"Go", "MongoDB"}, want: []string{"go", "mongodb"}},
		{name: "repeated spaces", tags: []string{"  machine    learning  "}, want: []string{"machine learning"}},
		{name: "duplicates after normalizing", tags: []string{"IA", "ia", " ia ", "I A"}, want: []string{"ia", "i a"}},
		{name: "empty tags are dropped", tags: []string{"", "   ", "go"}, want: []string{"go"}},
		{name: "order is kept", tags: []string{"z", "a", "m"}, want: []string{"z", "a", "m"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()
			input := draftInput("Tags")
			input.Tags = tt.tags

			assert.Equal(t, tt.want, f.createPost(t, input).Tags)
		})
	}
}

func TestPostServiceCreateRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name  string
		input PostInput
	}{
		{name: "empty title", input: PostInput{Title: "", Content: "c", Status: domain.PostStatusDraft}},
		{name: "blank title", input: PostInput{Title: "   ", Content: "c", Status: domain.PostStatusDraft}},
		{name: "blank content", input: PostInput{Title: "t", Content: " \n ", Status: domain.PostStatusDraft}},
		{name: "unknown status", input: PostInput{Title: "t", Content: "c", Status: "deleted"}},
		{name: "empty status", input: PostInput{Title: "t", Content: "c"}},
		{name: "invalid slug", input: withSlug(draftInput("t"), "Hola Mundo")},
		{name: "slug too long", input: withSlug(draftInput("t"), strings.Repeat("a", MaxSlugLength+1))},
		{name: "title without slug characters", input: draftInput("🚀🎉")},
		{name: "title with only symbols", input: draftInput("¿¡!?")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()

			_, err := f.service.Create(t.Context(), testAuthorID, tt.input)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Empty(t, f.posts.createAttempts)
		})
	}
}

func TestPostServiceCreateWithSentSlug(t *testing.T) {
	f := newPostFixture()

	post := f.createPost(t, withSlug(draftInput("🚀🎉"), "lanzamiento"))
	assert.Equal(t, "lanzamiento", post.Slug)
}

func TestPostServiceCreateSentSlugTakenIsNotRetried(t *testing.T) {
	f := newPostFixture()
	f.createPost(t, draftInput("Hola mundo"))
	f.posts.createAttempts = nil

	_, err := f.service.Create(t.Context(), testAuthorID, withSlug(draftInput("Otro"), "hola-mundo"))

	require.ErrorIs(t, err, domain.ErrDuplicateSlug)
	assert.Equal(t, []string{"hola-mundo"}, f.posts.createAttempts)
}

func TestPostServiceCreateGeneratedSlugUsesFirstFreeSuffix(t *testing.T) {
	f := newPostFixture()

	first := f.createPost(t, draftInput("Hola mundo"))
	second := f.createPost(t, draftInput("Hola, mundo"))
	third := f.createPost(t, draftInput("¡Hola mundo!"))

	assert.Equal(t, "hola-mundo", first.Slug)
	assert.Equal(t, "hola-mundo-2", second.Slug)
	assert.Equal(t, "hola-mundo-3", third.Slug)
}

func TestPostServiceCreateRetriesGeneratedSlugTakenConcurrently(t *testing.T) {
	tests := []struct {
		name         string
		takenSlugs   int
		wantSlug     string
		wantAttempts []string
		wantErr      error
	}{
		{
			name:         "no collision",
			takenSlugs:   0,
			wantSlug:     "hola-mundo",
			wantAttempts: []string{"hola-mundo"},
		},
		{
			name:         "one collision",
			takenSlugs:   1,
			wantSlug:     "hola-mundo-2",
			wantAttempts: []string{"hola-mundo", "hola-mundo-2"},
		},
		{
			name:         "four collisions, last attempt succeeds",
			takenSlugs:   4,
			wantSlug:     "hola-mundo-5",
			wantAttempts: []string{"hola-mundo", "hola-mundo-2", "hola-mundo-3", "hola-mundo-4", "hola-mundo-5"},
		},
		{
			name:         "five collisions gives up",
			takenSlugs:   5,
			wantAttempts: []string{"hola-mundo", "hola-mundo-2", "hola-mundo-3", "hola-mundo-4", "hola-mundo-5"},
			wantErr:      domain.ErrDuplicateSlug,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()

			// Las primeras takenSlugs veces otra petición gana la carrera.
			collisions := 0
			f.posts.slugTakenConcurrently = func(string) bool {
				collisions++
				return collisions <= tt.takenSlugs
			}

			post, err := f.service.Create(t.Context(), testAuthorID, draftInput("Hola mundo"))

			assert.Equal(t, tt.wantAttempts, f.posts.createAttempts)

			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Nil(t, post)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantSlug, post.Slug)
		})
	}
}

func TestPostServiceUpdateSlug(t *testing.T) {
	// Cada estado se construye con transiciones reales a partir de un borrador.
	tests := []struct {
		name    string
		history []domain.PostStatus
		wantErr error
	}{
		{name: "draft never published", history: nil},
		{name: "published", history: []domain.PostStatus{domain.PostStatusPublished}, wantErr: domain.ErrSlugLocked},
		{name: "back to draft after publishing", history: []domain.PostStatus{domain.PostStatusPublished, domain.PostStatusDraft}, wantErr: domain.ErrSlugLocked},
		{name: "archived after publishing", history: []domain.PostStatus{domain.PostStatusPublished, domain.PostStatusArchived}, wantErr: domain.ErrSlugLocked},
		{name: "archived never published", history: []domain.PostStatus{domain.PostStatusArchived}, wantErr: domain.ErrSlugLocked},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()
			post := f.createPost(t, draftInput("Original"))

			for _, status := range tt.history {
				_, err := f.service.Update(t.Context(), post.ID, withStatus(draftInput("Original"), status))
				require.NoError(t, err)
			}

			current, err := f.service.Get(t.Context(), post.ID)
			require.NoError(t, err)

			changed, err := f.service.Update(t.Context(), post.ID, withStatus(withSlug(draftInput("Original"), "nuevo-slug"), current.Status))
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)

				stored, getErr := f.service.Get(t.Context(), post.ID)
				require.NoError(t, getErr)
				assert.Equal(t, "original", stored.Slug)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, "nuevo-slug", changed.Slug)
		})
	}
}

func TestPostServiceUpdateSameOrEmptySlugIsAllowedWhenLocked(t *testing.T) {
	tests := []struct {
		name string
		slug string
	}{
		{name: "empty keeps the current slug", slug: ""},
		{name: "same slug", slug: "original"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()
			post := f.createPost(t, withStatus(draftInput("Original"), domain.PostStatusPublished))

			input := withStatus(withSlug(draftInput("Título nuevo"), tt.slug), domain.PostStatusPublished)

			updated, err := f.service.Update(t.Context(), post.ID, input)
			require.NoError(t, err)
			assert.Equal(t, "original", updated.Slug)
			assert.Equal(t, "Título nuevo", updated.Title)
		})
	}
}

func TestPostServiceUpdateSentSlugTaken(t *testing.T) {
	f := newPostFixture()
	f.createPost(t, draftInput("Tomado"))
	post := f.createPost(t, draftInput("Libre"))

	_, err := f.service.Update(t.Context(), post.ID, withSlug(draftInput("Libre"), "tomado"))
	require.ErrorIs(t, err, domain.ErrDuplicateSlug)
}

func TestPostServiceUpdate(t *testing.T) {
	f := newPostFixture()
	post := f.createPost(t, draftInput("Original"))

	f.clock.Advance(time.Hour)

	updated, err := f.service.Update(t.Context(), post.ID, PostInput{
		Title:   "Editado",
		Content: "Contenido **nuevo**.",
		Tags:    []string{"Go"},
		Status:  domain.PostStatusDraft,
	})
	require.NoError(t, err)

	assert.Equal(t, "Editado", updated.Title)
	assert.Equal(t, "original", updated.Slug, "el slug no se regenera del título nuevo")
	assert.Equal(t, "Contenido nuevo.", updated.Excerpt, "el extracto vacío se regenera del contenido nuevo")
	assert.Equal(t, []string{"go"}, updated.Tags)
	assert.Equal(t, post.CreatedAt, updated.CreatedAt)
	assert.Equal(t, f.clock.Now(), updated.UpdatedAt)
	assert.Equal(t, testAuthorID, updated.AuthorID)

	stored, err := f.service.Get(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, updated, stored)
}

func TestPostServiceUpdateErrors(t *testing.T) {
	f := newPostFixture()
	post := f.createPost(t, draftInput("Original"))

	tests := []struct {
		name    string
		id      string
		input   PostInput
		wantErr error
	}{
		{name: "missing post", id: "missing", input: draftInput("t"), wantErr: domain.ErrNotFound},
		{name: "invalid input", id: post.ID, input: draftInput(""), wantErr: domain.ErrInvalidInput},
		{name: "invalid slug", id: post.ID, input: withSlug(draftInput("t"), "No-Valido"), wantErr: domain.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := f.service.Update(t.Context(), tt.id, tt.input)
			require.ErrorIs(t, err, tt.wantErr)
		})
	}
}

func TestPostServicePublishedAtIsSetOnlyOnFirstPublication(t *testing.T) {
	f := newPostFixture()
	post := f.createPost(t, draftInput("Ciclo"))
	require.Nil(t, post.PublishedAt)

	steps := []struct {
		status domain.PostStatus
		want   time.Time
	}{
		{status: domain.PostStatusPublished, want: f.clock.Now().Add(time.Hour)},
		{status: domain.PostStatusDraft, want: f.clock.Now().Add(time.Hour)},
		{status: domain.PostStatusPublished, want: f.clock.Now().Add(time.Hour)},
		{status: domain.PostStatusArchived, want: f.clock.Now().Add(time.Hour)},
		{status: domain.PostStatusPublished, want: f.clock.Now().Add(time.Hour)},
	}

	for _, step := range steps {
		f.clock.Advance(time.Hour)

		updated, err := f.service.Update(t.Context(), post.ID, withStatus(draftInput("Ciclo"), step.status))
		require.NoError(t, err)
		require.NotNil(t, updated.PublishedAt)
		assert.Equal(t, step.want, *updated.PublishedAt, "status %s", step.status)
	}

	f.clock.Advance(time.Hour)
	require.NoError(t, f.service.Archive(t.Context(), post.ID))

	archived, err := f.service.Get(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, steps[0].want, *archived.PublishedAt)
}

func TestPostServiceArchive(t *testing.T) {
	f := newPostFixture()
	post := f.createPost(t, withStatus(draftInput("Archivar"), domain.PostStatusPublished))
	publishedAt := *post.PublishedAt

	f.clock.Advance(time.Hour)
	require.NoError(t, f.service.Archive(t.Context(), post.ID))

	archived, err := f.service.Get(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.PostStatusArchived, archived.Status)
	assert.Equal(t, f.clock.Now(), archived.UpdatedAt)
	assert.Equal(t, publishedAt, *archived.PublishedAt)
	assert.Equal(t, post.Content, archived.Content, "archivar no borra datos")

	// Archivar de nuevo no hace nada: no cambia ni la fecha de edición.
	f.clock.Advance(time.Hour)
	require.NoError(t, f.service.Archive(t.Context(), post.ID))

	again, err := f.service.Get(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, archived, again)

	require.ErrorIs(t, f.service.Archive(t.Context(), "missing"), domain.ErrNotFound)
}

func TestPostServiceGetPublished(t *testing.T) {
	f := newPostFixture()
	f.createPost(t, withStatus(draftInput("Publicado"), domain.PostStatusPublished))
	f.createPost(t, draftInput("Borrador"))
	archived := f.createPost(t, withStatus(draftInput("Archivado"), domain.PostStatusPublished))
	require.NoError(t, f.service.Archive(t.Context(), archived.ID))

	tests := []struct {
		slug    string
		wantErr error
	}{
		{slug: "publicado"},
		{slug: "borrador", wantErr: domain.ErrNotFound},
		{slug: "archivado", wantErr: domain.ErrNotFound},
		{slug: "no-existe", wantErr: domain.ErrNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.slug, func(t *testing.T) {
			post, err := f.service.GetPublished(t.Context(), tt.slug)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.slug, post.Slug)
		})
	}
}

func TestPostServiceListPublished(t *testing.T) {
	f := newPostFixture()
	published := f.createPost(t, withStatus(draftInput("Publicado"), domain.PostStatusPublished))
	f.createPost(t, draftInput("Borrador"))

	page, err := f.service.ListPublished(t.Context(), "  Machine   Learning ", 0, 0)
	require.NoError(t, err)

	assert.Equal(t, domain.PostFilter{
		Status: domain.PostStatusPublished,
		Tag:    "machine learning",
		Order:  domain.PostOrderPublishedDesc,
		Limit:  DefaultPostLimit,
		Offset: 0,
	}, f.posts.lastFilter)
	assert.Equal(t, DefaultPostLimit, page.Limit)
	assert.Equal(t, 0, page.Offset)

	page, err = f.service.ListPublished(t.Context(), "", 10, 0)
	require.NoError(t, err)
	require.Len(t, page.Posts, 1)
	assert.Equal(t, published.ID, page.Posts[0].ID)
	assert.EqualValues(t, 1, page.Total)
}

func TestPostServiceList(t *testing.T) {
	f := newPostFixture()

	_, err := f.service.List(t.Context(), PostListParams{Status: domain.PostStatusArchived, Tag: "Go", Limit: 5, Offset: 10})
	require.NoError(t, err)

	assert.Equal(t, domain.PostFilter{
		Status: domain.PostStatusArchived,
		Tag:    "go",
		Order:  domain.PostOrderUpdatedDesc,
		Limit:  5,
		Offset: 10,
	}, f.posts.lastFilter)
}

func TestPostServiceListPage(t *testing.T) {
	tests := []struct {
		name       string
		params     PostListParams
		wantLimit  int
		wantOffset int
		wantErr    error
	}{
		{name: "defaults", params: PostListParams{}, wantLimit: DefaultPostLimit},
		{name: "maximums", params: PostListParams{Limit: MaxPostLimit, Offset: MaxPostOffset}, wantLimit: MaxPostLimit, wantOffset: MaxPostOffset},
		{name: "limit over maximum", params: PostListParams{Limit: MaxPostLimit + 1}, wantErr: domain.ErrInvalidInput},
		{name: "negative limit", params: PostListParams{Limit: -1}, wantErr: domain.ErrInvalidInput},
		{name: "offset over maximum", params: PostListParams{Offset: MaxPostOffset + 1}, wantErr: domain.ErrInvalidInput},
		{name: "negative offset", params: PostListParams{Offset: -1}, wantErr: domain.ErrInvalidInput},
		{name: "unknown status", params: PostListParams{Status: "deleted"}, wantErr: domain.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPostFixture()

			page, err := f.service.List(t.Context(), tt.params)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantLimit, page.Limit)
			assert.Equal(t, tt.wantOffset, page.Offset)
		})
	}
}
