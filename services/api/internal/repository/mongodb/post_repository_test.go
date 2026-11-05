package mongodb

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func newTestPostRepository(t *testing.T) *PostRepository {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewPostRepository(client)
}

var postTestTime = time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

func newPost(slug string) *domain.Post {
	return &domain.Post{
		AuthorID:  bson.NewObjectID().Hex(),
		Title:     "Title " + slug,
		Slug:      slug,
		Excerpt:   "Excerpt",
		Content:   "# Heading\n\n<script>alert(1)</script> **Markdown** as is.",
		Tags:      []string{"go", "mongo"},
		Status:    domain.PostStatusDraft,
		SEO:       domain.SEO{Title: "SEO", Keywords: []string{"go"}, CanonicalURL: "https://huitzi.xyz/" + slug},
		CreatedAt: postTestTime,
		UpdatedAt: postTestTime,
	}
}

func newPublishedPost(slug string, publishedAt time.Time) *domain.Post {
	post := newPost(slug)
	post.Status = domain.PostStatusPublished
	post.PublishedAt = &publishedAt

	return post
}

func createPosts(t *testing.T, repository *PostRepository, posts ...*domain.Post) {
	t.Helper()

	for _, post := range posts {
		require.NoError(t, repository.Create(t.Context(), post))
	}
}

func slugsOf(posts []*domain.Post) []string {
	slugs := make([]string, 0, len(posts))
	for _, post := range posts {
		slugs = append(slugs, post.Slug)
	}

	return slugs
}

func TestPostDocumentRoundTrip(t *testing.T) {
	id := bson.NewObjectID()

	tests := []struct {
		name string
		post *domain.Post
	}{
		{name: "draft", post: newPost("draft")},
		{name: "published", post: newPublishedPost("published", postTestTime)},
		{name: "nil lists become empty", post: &domain.Post{Tags: nil, SEO: domain.SEO{Keywords: nil}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := toDomainPost(toPostDocument(tt.post, id))

			want := *tt.post
			want.ID = id.Hex()
			want.Tags = nonNilStrings(want.Tags)
			want.SEO.Keywords = nonNilStrings(want.SEO.Keywords)

			assert.Equal(t, &want, got)
		})
	}
}

func TestPostRepositoryCreateAndGet(t *testing.T) {
	repository := newTestPostRepository(t)
	post := newPublishedPost("hola-mundo", postTestTime)

	createPosts(t, repository, post)
	require.NotEmpty(t, post.ID)

	byID, err := repository.GetByID(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, post, byID)

	bySlug, err := repository.GetBySlug(t.Context(), post.Slug)
	require.NoError(t, err)
	assert.Equal(t, post, bySlug)
}

func TestPostRepositoryCreateRejectsDuplicateSlug(t *testing.T) {
	repository := newTestPostRepository(t)
	createPosts(t, repository, newPost("hola-mundo"))

	err := repository.Create(t.Context(), newPost("hola-mundo"))
	require.ErrorIs(t, err, domain.ErrDuplicateSlug)
}

func TestPostRepositoryNotFound(t *testing.T) {
	repository := newTestPostRepository(t)

	tests := []struct {
		name string
		call func() error
	}{
		{name: "get by id missing", call: func() error {
			_, err := repository.GetByID(t.Context(), bson.NewObjectID().Hex())
			return err
		}},
		{name: "get by id invalid", call: func() error {
			_, err := repository.GetByID(t.Context(), "not-an-object-id")
			return err
		}},
		{name: "get by slug missing", call: func() error {
			_, err := repository.GetBySlug(t.Context(), "missing")
			return err
		}},
		{name: "update missing", call: func() error {
			post := newPost("missing")
			post.ID = bson.NewObjectID().Hex()
			return repository.Update(t.Context(), post)
		}},
		{name: "update invalid id", call: func() error {
			post := newPost("missing")
			post.ID = "not-an-object-id"
			return repository.Update(t.Context(), post)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.ErrorIs(t, tt.call(), domain.ErrNotFound)
		})
	}
}

func TestPostRepositoryUpdate(t *testing.T) {
	repository := newTestPostRepository(t)
	post := newPost("borrador")
	createPosts(t, repository, post)

	publishedAt := postTestTime.Add(time.Hour)
	updated := *post
	updated.AuthorID = bson.NewObjectID().Hex()
	updated.CreatedAt = postTestTime.Add(24 * time.Hour)
	updated.Title = "Nuevo título"
	updated.Slug = "nuevo-titulo"
	updated.Tags = []string{"ia"}
	updated.Status = domain.PostStatusPublished
	updated.PublishedAt = &publishedAt
	updated.UpdatedAt = publishedAt

	require.NoError(t, repository.Update(t.Context(), &updated))

	got, err := repository.GetByID(t.Context(), post.ID)
	require.NoError(t, err)

	want := updated
	want.AuthorID = post.AuthorID
	want.CreatedAt = post.CreatedAt
	assert.Equal(t, &want, got)
}

func TestPostRepositoryUpdateRejectsDuplicateSlug(t *testing.T) {
	repository := newTestPostRepository(t)
	taken := newPost("tomado")
	post := newPost("libre")
	createPosts(t, repository, taken, post)

	post.Slug = taken.Slug

	err := repository.Update(t.Context(), post)
	require.ErrorIs(t, err, domain.ErrDuplicateSlug)
}

func TestPostRepositoryListFilters(t *testing.T) {
	repository := newTestPostRepository(t)

	draft := newPost("draft")
	draft.Tags = []string{"go"}
	published := newPublishedPost("published", postTestTime)
	published.Tags = []string{"go", "ia"}
	archived := newPost("archived")
	archived.Status = domain.PostStatusArchived
	archived.Tags = []string{"ia"}
	createPosts(t, repository, draft, published, archived)

	tests := []struct {
		name   string
		filter domain.PostFilter
		want   []string
	}{
		{name: "no filter", filter: domain.PostFilter{}, want: []string{"archived", "published", "draft"}},
		{name: "status", filter: domain.PostFilter{Status: domain.PostStatusPublished}, want: []string{"published"}},
		{name: "tag", filter: domain.PostFilter{Tag: "ia"}, want: []string{"archived", "published"}},
		{name: "status and tag", filter: domain.PostFilter{Status: domain.PostStatusDraft, Tag: "go"}, want: []string{"draft"}},
		{name: "no match", filter: domain.PostFilter{Tag: "rust"}, want: []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.filter.Limit = 10

			posts, total, err := repository.List(t.Context(), tt.filter)
			require.NoError(t, err)
			assert.Equal(t, tt.want, slugsOf(posts))
			assert.EqualValues(t, len(tt.want), total)
		})
	}
}

func TestPostRepositoryListOrder(t *testing.T) {
	repository := newTestPostRepository(t)

	// El orden de publicación no coincide con el de edición ni con el de creación.
	oldest := newPublishedPost("oldest", postTestTime)
	oldest.UpdatedAt = postTestTime.Add(3 * time.Hour)
	newest := newPublishedPost("newest", postTestTime.Add(2*time.Hour))
	newest.UpdatedAt = postTestTime.Add(time.Hour)
	middle := newPublishedPost("middle", postTestTime.Add(time.Hour))
	middle.UpdatedAt = postTestTime.Add(2 * time.Hour)
	createPosts(t, repository, oldest, newest, middle)

	tests := []struct {
		name  string
		order domain.PostOrder
		want  []string
	}{
		{name: "published desc", order: domain.PostOrderPublishedDesc, want: []string{"newest", "middle", "oldest"}},
		{name: "updated desc", order: domain.PostOrderUpdatedDesc, want: []string{"oldest", "middle", "newest"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts, _, err := repository.List(t.Context(), domain.PostFilter{Order: tt.order, Limit: 10})
			require.NoError(t, err)
			assert.Equal(t, tt.want, slugsOf(posts))
		})
	}
}

func TestPostRepositoryListPagination(t *testing.T) {
	repository := newTestPostRepository(t)

	// Cinco posts con la misma fecha: el desempate por _id mantiene las
	// páginas estables y sin solapes.
	for i := range 5 {
		createPosts(t, repository, newPublishedPost(fmt.Sprintf("post-%d", i), postTestTime))
	}

	tests := []struct {
		name   string
		limit  int
		offset int
		want   []string
	}{
		{name: "first page", limit: 2, offset: 0, want: []string{"post-4", "post-3"}},
		{name: "second page", limit: 2, offset: 2, want: []string{"post-2", "post-1"}},
		{name: "last partial page", limit: 2, offset: 4, want: []string{"post-0"}},
		{name: "past the end", limit: 2, offset: 10, want: []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts, total, err := repository.List(t.Context(), domain.PostFilter{
				Status: domain.PostStatusPublished,
				Order:  domain.PostOrderPublishedDesc,
				Limit:  tt.limit,
				Offset: tt.offset,
			})
			require.NoError(t, err)
			assert.Equal(t, tt.want, slugsOf(posts))
			assert.EqualValues(t, 5, total)
		})
	}
}

func TestPostRepositoryListRejectsInvalidPage(t *testing.T) {
	repository := newTestPostRepository(t)

	tests := []struct {
		name   string
		filter domain.PostFilter
	}{
		{name: "zero limit", filter: domain.PostFilter{Limit: 0}},
		{name: "negative limit", filter: domain.PostFilter{Limit: -1}},
		{name: "negative offset", filter: domain.PostFilter{Limit: 1, Offset: -1}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := repository.List(t.Context(), tt.filter)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}

// indexSpec es lo que se comprueba de cada índice listado por MongoDB.
type indexSpec struct {
	Key    bson.D `bson:"key"`
	Unique bool   `bson:"unique"`
}

func TestEnsureIndexesCreatesPostIndexes(t *testing.T) {
	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	cursor, err := client.database.Collection(postsCollection).Indexes().List(t.Context())
	require.NoError(t, err)

	var indexes []indexSpec
	require.NoError(t, cursor.All(t.Context(), &indexes))

	assert.Contains(t, indexes, indexSpec{Key: bson.D{{Key: "slug", Value: int32(1)}}, Unique: true})

	assert.Contains(t, indexes, indexSpec{Key: bson.D{{Key: "status", Value: int32(1)}, {Key: "published_at", Value: int32(-1)}, {Key: "_id", Value: int32(-1)}}})
}
