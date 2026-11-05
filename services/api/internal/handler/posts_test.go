package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	testPostID   = "6730f1a2b3c4d5e6f7a8b9c0"
	testPostSlug = "hola-mundo"
)

var testPostTime = time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

func newTestPost() *domain.Post {
	publishedAt := testPostTime.Add(time.Hour)

	return &domain.Post{
		ID:          testPostID,
		AuthorID:    testUser.ID,
		Title:       "Hola mundo",
		Slug:        testPostSlug,
		Excerpt:     "Primer post.",
		Content:     "# Hola\n\n<script>alert(1)</script> **Markdown** tal cual.",
		Tags:        []string{"go"},
		Status:      domain.PostStatusPublished,
		SEO:         domain.SEO{Title: "SEO", CanonicalURL: "https://huitzi.xyz/hola-mundo"},
		PublishedAt: &publishedAt,
		CreatedAt:   testPostTime,
		UpdatedAt:   testPostTime.Add(2 * time.Hour),
	}
}

// fakePosts simula el service: conoce un solo post (testPostID, testPostSlug),
// registra lo que recibe y devuelve err si está fijado.
type fakePosts struct {
	mu sync.Mutex

	post *domain.Post
	err  error

	authorID      string
	input         service.PostInput
	listParams    service.PostListParams
	publishedArgs []any
	archived      []string
}

func newFakePosts() *fakePosts {
	return &fakePosts{post: newTestPost()}
}

func (f *fakePosts) Create(_ context.Context, authorID string, input service.PostInput) (*domain.Post, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.authorID, f.input = authorID, input
	if f.err != nil {
		return nil, f.err
	}

	return f.post, nil
}

func (f *fakePosts) Update(_ context.Context, id string, input service.PostInput) (*domain.Post, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.input = input

	return f.find(id)
}

func (f *fakePosts) Archive(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if _, err := f.find(id); err != nil {
		return err
	}

	f.archived = append(f.archived, id)

	return nil
}

func (f *fakePosts) Get(_ context.Context, id string) (*domain.Post, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.find(id)
}

func (f *fakePosts) List(_ context.Context, params service.PostListParams) (service.PostPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.listParams = params

	return f.page()
}

func (f *fakePosts) GetPublished(_ context.Context, slug string) (*domain.Post, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return nil, f.err
	}

	if slug != f.post.Slug {
		return nil, domain.ErrNotFound
	}

	return f.post, nil
}

func (f *fakePosts) ListPublished(_ context.Context, tag string, limit, offset int) (service.PostPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.publishedArgs = []any{tag, limit, offset}

	return f.page()
}

// find busca por ID como el repositorio: cualquier otro ID, también uno con
// formato inválido, no existe.
func (f *fakePosts) find(id string) (*domain.Post, error) {
	if f.err != nil {
		return nil, f.err
	}

	if id != f.post.ID {
		return nil, domain.ErrNotFound
	}

	return f.post, nil
}

func (f *fakePosts) page() (service.PostPage, error) {
	if f.err != nil {
		return service.PostPage{}, f.err
	}

	return service.PostPage{Posts: []*domain.Post{f.post}, Total: 1, Limit: 20, Offset: 0}, nil
}

func postsRouter(t *testing.T, posts *fakePosts) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.Posts = posts

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	router, err := NewRouter(&fakePinger{}, spec, cfg)
	require.NoError(t, err)

	return router
}

func adminSession() map[string]string {
	return withCookies(accessCookie(testAccessToken))
}

const wantPostJSON = `{
	"id": "6730f1a2b3c4d5e6f7a8b9c0",
	"authorId": "user-1",
	"title": "Hola mundo",
	"slug": "hola-mundo",
	"excerpt": "Primer post.",
	"content": "# Hola\n\n<script>alert(1)</script> **Markdown** tal cual.",
	"tags": ["go"],
	"status": "published",
	"seo": {"title": "SEO", "keywords": [], "canonicalUrl": "https://huitzi.xyz/hola-mundo"},
	"publishedAt": "2026-11-05T13:00:00Z",
	"createdAt": "2026-11-05T12:00:00Z",
	"updatedAt": "2026-11-05T14:00:00Z"
}`

const wantPageJSON = `{
	"items": [{
		"id": "6730f1a2b3c4d5e6f7a8b9c0",
		"authorId": "user-1",
		"title": "Hola mundo",
		"slug": "hola-mundo",
		"excerpt": "Primer post.",
		"tags": ["go"],
		"status": "published",
		"publishedAt": "2026-11-05T13:00:00Z",
		"createdAt": "2026-11-05T12:00:00Z",
		"updatedAt": "2026-11-05T14:00:00Z"
	}],
	"total": 1,
	"limit": 20,
	"offset": 0
}`

func TestListPublishedPosts(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		wantArgs []any
	}{
		// El validador aplica el default del contrato antes del handler.
		{name: "defaults", path: "/api/v1/posts", wantArgs: []any{"", 20, 0}},
		{name: "filters", path: "/api/v1/posts?tag=go&limit=5&offset=10000", wantArgs: []any{"go", 5, 10000}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts := newFakePosts()

			response := get(postsRouter(t, posts), tt.path)

			require.Equal(t, http.StatusOK, response.Code)
			assert.JSONEq(t, wantPageJSON, response.Body.String())
			assert.Equal(t, tt.wantArgs, posts.publishedArgs)
		})
	}
}

func TestGetPublishedPost(t *testing.T) {
	router := postsRouter(t, newFakePosts())

	found := get(router, "/api/v1/posts/"+testPostSlug)
	require.Equal(t, http.StatusOK, found.Code)
	assert.JSONEq(t, wantPostJSON, found.Body.String(), "el Markdown sale tal cual, sin convertir a HTML")

	requireProblem(t, get(router, "/api/v1/posts/no-existe"), http.StatusNotFound)
}

func TestPublicPostsRejectOutOfRangeParameters(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		detail string
	}{
		{name: "limit over maximum", path: "/api/v1/posts?limit=101", detail: "limit: number must be at most 100"},
		{name: "offset over maximum", path: "/api/v1/posts?offset=10001", detail: "offset: number must be at most 10000"},
		{name: "negative offset", path: "/api/v1/posts?offset=-1", detail: "offset: number must be at least 0"},
		{name: "tag too long", path: "/api/v1/posts?tag=" + strings.Repeat("a", 51), detail: "tag: maximum string length is 50"},
		{name: "slug too long", path: "/api/v1/posts/" + strings.Repeat("a", 81), detail: "slug: maximum string length is 80"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts := newFakePosts()

			problem := requireProblem(t, get(postsRouter(t, posts), tt.path), http.StatusBadRequest)
			assert.Equal(t, tt.detail, *problem.Detail)
			assert.Nil(t, posts.publishedArgs, "el handler no se llamó")
		})
	}
}

func TestListPosts(t *testing.T) {
	posts := newFakePosts()

	response := send(postsRouter(t, posts), http.MethodGet, "/api/v1/admin/posts?status=draft&tag=go&limit=5&offset=10", "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, wantPageJSON, response.Body.String())
	assert.Equal(t, service.PostListParams{Status: domain.PostStatusDraft, Tag: "go", Limit: 5, Offset: 10}, posts.listParams)
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
}

func TestCreatePost(t *testing.T) {
	tests := []struct {
		name string
		body string
		want service.PostInput
	}{
		{
			name: "minimal body generates slug and excerpt in the service",
			body: `{"title":"Hola mundo","content":"Texto","status":"draft"}`,
			want: service.PostInput{Title: "Hola mundo", Content: "Texto", Status: domain.PostStatusDraft},
		},
		{
			name: "full body",
			body: `{"title":"Hola","slug":"hola","excerpt":"Ex","content":"Texto","tags":["Go"],"status":"published",
				"seo":{"title":"T","description":"D","keywords":["k"],"canonicalUrl":"https://huitzi.xyz/hola","ogImageUrl":"https://huitzi.xyz/og.png"}}`,
			want: service.PostInput{
				Title: "Hola", Slug: "hola", Excerpt: "Ex", Content: "Texto", Tags: []string{"Go"}, Status: domain.PostStatusPublished,
				SEO: domain.SEO{Title: "T", Description: "D", Keywords: []string{"k"}, CanonicalURL: "https://huitzi.xyz/hola", OGImageURL: "https://huitzi.xyz/og.png"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts := newFakePosts()

			response := send(postsRouter(t, posts), http.MethodPost, "/api/v1/admin/posts", tt.body, adminSession())

			require.Equal(t, http.StatusCreated, response.Code)
			assert.JSONEq(t, wantPostJSON, response.Body.String())
			assert.Equal(t, testUser.ID, posts.authorID, "el autor sale de la sesión, no del cuerpo")
			assert.Equal(t, tt.want, posts.input)
		})
	}
}

func TestCreatePostRejectsInvalidBody(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		detail string
	}{
		{name: "missing title", body: `{"content":"c","status":"draft"}`, detail: `title: property "title" is missing`},
		{name: "title too long", body: `{"title":"` + strings.Repeat("a", 201) + `","content":"c","status":"draft"}`, detail: "title: maximum string length is 200"},
		{name: "invalid slug", body: `{"title":"t","slug":"Hola Mundo","content":"c","status":"draft"}`, detail: `slug: string doesn't match the regular expression "^[a-z0-9]+(-[a-z0-9]+)*$"`},
		{name: "slug too long", body: `{"title":"t","slug":"` + strings.Repeat("a", 81) + `","content":"c","status":"draft"}`, detail: "slug: maximum string length is 80"},
		{name: "unknown status", body: `{"title":"t","content":"c","status":"deleted"}`},
		{name: "too many tags", body: `{"title":"t","content":"c","status":"draft","tags":[` + strings.Repeat(`"a",`, 20) + `"a"]}`, detail: "tags: maximum number of items is 20"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts := newFakePosts()

			problem := requireProblem(t, send(postsRouter(t, posts), http.MethodPost, "/api/v1/admin/posts", tt.body, adminSession()), http.StatusBadRequest)
			if tt.detail != "" {
				assert.Equal(t, tt.detail, *problem.Detail)
			}

			assert.Empty(t, posts.authorID, "el handler no se llamó")
		})
	}
}

func TestAdminPostOperations(t *testing.T) {
	const body = `{"title":"Hola","content":"Texto","status":"draft"}`

	item := "/api/v1/admin/posts/" + testPostID

	tests := []struct {
		name   string
		method string
		path   string
		body   string
		status int
	}{
		{name: "get", method: http.MethodGet, path: item, status: http.StatusOK},
		{name: "update", method: http.MethodPut, path: item, body: body, status: http.StatusOK},
		{name: "archive", method: http.MethodDelete, path: item, status: http.StatusNoContent},
		{name: "get missing", method: http.MethodGet, path: "/api/v1/admin/posts/6730f1a2b3c4d5e6f7a8b9c1", status: http.StatusNotFound},
		// ADR-010: un ID con formato inválido es un 404, no un 400 ni un 500.
		{name: "get invalid id", method: http.MethodGet, path: "/api/v1/admin/posts/not-an-object-id", status: http.StatusNotFound},
		{name: "update invalid id", method: http.MethodPut, path: "/api/v1/admin/posts/not-an-object-id", body: body, status: http.StatusNotFound},
		{name: "archive invalid id", method: http.MethodDelete, path: "/api/v1/admin/posts/not-an-object-id", status: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := send(postsRouter(t, newFakePosts()), tt.method, tt.path, tt.body, adminSession())

			if tt.status >= http.StatusBadRequest {
				requireProblem(t, response, tt.status)
				return
			}

			require.Equal(t, tt.status, response.Code)

			if tt.status == http.StatusOK {
				assert.JSONEq(t, wantPostJSON, response.Body.String())
			}
		})
	}
}

func TestDeletePostArchives(t *testing.T) {
	posts := newFakePosts()

	response := send(postsRouter(t, posts), http.MethodDelete, "/api/v1/admin/posts/"+testPostID, "", adminSession())

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Empty(t, response.Body.String())
	assert.Equal(t, []string{testPostID}, posts.archived)
}

func TestAdminPostsRequireAdminSession(t *testing.T) {
	const body = `{"title":"Hola","content":"Texto","status":"draft"}`

	item := "/api/v1/admin/posts/" + testPostID

	operations := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodGet, path: "/api/v1/admin/posts"},
		{method: http.MethodPost, path: "/api/v1/admin/posts", body: body},
		{method: http.MethodGet, path: item},
		{method: http.MethodPut, path: item, body: body},
		{method: http.MethodDelete, path: item},
	}

	sessions := []struct {
		name    string
		cookies map[string]string
		status  int
	}{
		{name: "without session", status: http.StatusUnauthorized},
		{name: "forged session", cookies: withCookies(accessCookie("forged")), status: http.StatusUnauthorized},
		{name: "not an admin", cookies: withCookies(accessCookie(editorAccessToken)), status: http.StatusForbidden},
	}

	for _, operation := range operations {
		for _, session := range sessions {
			t.Run(operation.method+" "+operation.path+" "+session.name, func(t *testing.T) {
				posts := newFakePosts()

				response := send(postsRouter(t, posts), operation.method, operation.path, operation.body, session.cookies)

				requireProblem(t, response, session.status)
				assert.Empty(t, posts.archived)
				assert.Empty(t, posts.authorID)
			})
		}
	}
}

func TestPostDomainErrors(t *testing.T) {
	const body = `{"title":"Hola","content":"Texto","status":"draft"}`

	tests := []struct {
		name   string
		err    error
		method string
		path   string
		status int
		detail string
	}{
		{name: "duplicate slug on create", err: domain.ErrDuplicateSlug, method: http.MethodPost, path: "/api/v1/admin/posts", status: http.StatusConflict, detail: detailDuplicateSlug},
		{name: "duplicate slug on update", err: domain.ErrDuplicateSlug, method: http.MethodPut, path: "/api/v1/admin/posts/" + testPostID, status: http.StatusConflict, detail: detailDuplicateSlug},
		{name: "slug locked", err: domain.ErrSlugLocked, method: http.MethodPut, path: "/api/v1/admin/posts/" + testPostID, status: http.StatusConflict, detail: detailSlugLocked},
		{name: "service validation", err: domain.ErrInvalidInput, method: http.MethodPost, path: "/api/v1/admin/posts", status: http.StatusBadRequest, detail: detailInvalidPost},
		{name: "public list validation", err: domain.ErrInvalidInput, method: http.MethodGet, path: "/api/v1/posts", status: http.StatusBadRequest, detail: detailInvalidPost},
		{name: "failure hides the cause", err: errors.New("mongo: secret connection string"), method: http.MethodGet, path: "/api/v1/posts/" + testPostSlug, status: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts := newFakePosts()
			posts.err = tt.err

			requestBody := ""
			if tt.method == http.MethodPost || tt.method == http.MethodPut {
				requestBody = body
			}

			response := send(postsRouter(t, posts), tt.method, tt.path, requestBody, adminSession())

			problem := requireProblem(t, response, tt.status)
			if tt.detail != "" {
				assert.Equal(t, tt.detail, *problem.Detail)
			}

			assert.NotContains(t, response.Body.String(), "secret")
		})
	}
}

func TestDraftPostHasNoPublishedAt(t *testing.T) {
	posts := newFakePosts()
	posts.post.Status = domain.PostStatusDraft
	posts.post.PublishedAt = nil

	response := send(postsRouter(t, posts), http.MethodGet, "/api/v1/admin/posts/"+testPostID, "", adminSession())
	require.Equal(t, http.StatusOK, response.Code)

	var post gen.Post
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &post))
	assert.Nil(t, post.PublishedAt)
	assert.NotContains(t, response.Body.String(), "publishedAt")
}
