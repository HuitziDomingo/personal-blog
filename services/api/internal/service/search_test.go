package service

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func TestSearchPublished(t *testing.T) {
	f := newPostFixture()
	agents := f.createPost(t, PostInput{Title: "Orquestación de agentes", Content: "Planificadores y **subagentes**.", Status: domain.PostStatusPublished})
	f.createPost(t, PostInput{Title: "Go hexagonal", Content: "Puertos y adaptadores.", Tags: []string{"Go"}, Status: domain.PostStatusPublished})
	f.createPost(t, PostInput{Title: "Borrador sobre agentes", Content: "Aún no.", Status: domain.PostStatusDraft})

	tests := []struct {
		name  string
		query string
		want  []string
	}{
		{"por título, sin distinguir mayúsculas", "ORQUESTACIÓN", []string{agents.Slug}},
		{"por contenido", "subagentes", []string{agents.Slug}},
		{"por etiqueta", "go", []string{"go-hexagonal"}},
		{"los borradores no aparecen", "borrador", []string{}},
		{"espacios alrededor", "  puertos  ", []string{"go-hexagonal"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			posts, err := f.service.SearchPublished(t.Context(), tt.query, 0)

			require.NoError(t, err)
			slugs := []string{}
			for _, post := range posts {
				slugs = append(slugs, post.Slug)
			}
			assert.ElementsMatch(t, tt.want, slugs)
		})
	}
}

func TestSearchPublishedRespectsLimit(t *testing.T) {
	f := newPostFixture()
	for _, title := range []string{"Agentes uno", "Agentes dos", "Agentes tres"} {
		f.createPost(t, PostInput{Title: title, Content: "x", Status: domain.PostStatusPublished})
	}

	posts, err := f.service.SearchPublished(t.Context(), "agentes", 2)

	require.NoError(t, err)
	assert.Len(t, posts, 2)
}

func TestSearchPublishedRejectsInvalidInput(t *testing.T) {
	f := newPostFixture()

	for name, call := range map[string]func() error{
		"consulta vacía": func() error { _, err := f.service.SearchPublished(t.Context(), "   ", 0); return err },
		"consulta larga": func() error {
			_, err := f.service.SearchPublished(t.Context(), strings.Repeat("á", MaxSearchQueryLength+1), 0)
			return err
		},
		"limit fuera de rango": func() error { _, err := f.service.SearchPublished(t.Context(), "x", MaxPostLimit+1); return err },
	} {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, call(), domain.ErrInvalidInput)
		})
	}

	_, err := f.service.SearchPublished(t.Context(), strings.Repeat("á", MaxSearchQueryLength), 0)
	require.NoError(t, err, "200 characters are fine even if they are 400 bytes")
}

// pagingPosts es un repositorio falso (ADR-015) que, a diferencia de
// fakePostRepository, pagina con Limit y Offset y ordena por PublishedAt
// descendente, como MongoDB. Solo implementa List.
type pagingPosts struct {
	domain.PostRepository

	published []*domain.Post // ya ordenados, el más reciente primero
	pages     int
}

func (p *pagingPosts) List(_ context.Context, filter domain.PostFilter) ([]*domain.Post, int64, error) {
	p.pages++
	start := min(filter.Offset, len(p.published))
	end := min(start+filter.Limit, len(p.published))

	return p.published[start:end], int64(len(p.published)), nil
}

func newPagingPosts(n int, title func(i int) string) *pagingPosts {
	base := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	posts := make([]*domain.Post, 0, n)
	for i := range n {
		publishedAt := base.Add(-time.Duration(i) * time.Hour)
		posts = append(posts, &domain.Post{Slug: fmt.Sprintf("post-%d", i), Title: title(i), Status: domain.PostStatusPublished, PublishedAt: &publishedAt})
	}

	return &pagingPosts{published: posts}
}

func TestSearchPublishedPagesInOrder(t *testing.T) {
	// 250 publicados: coinciden los múltiplos de 50, repartidos en 3 páginas.
	repo := newPagingPosts(250, func(i int) string {
		if i%50 == 0 {
			return "Agentes"
		}
		return "Otro"
	})
	service := NewPostService(repo, time.Now)

	posts, err := service.SearchPublished(t.Context(), "agentes", 0)

	require.NoError(t, err)
	slugs := []string{}
	for _, post := range posts {
		slugs = append(slugs, post.Slug)
	}
	assert.Equal(t, []string{"post-0", "post-50", "post-100", "post-150", "post-200"}, slugs, "most recently published first")
	assert.Equal(t, 3, repo.pages)
}

func TestSearchPublishedStopsAtTheLimit(t *testing.T) {
	repo := newPagingPosts(500, func(int) string { return "Agentes" })
	service := NewPostService(repo, time.Now)

	posts, err := service.SearchPublished(t.Context(), "agentes", 5)

	require.NoError(t, err)
	assert.Len(t, posts, 5)
	assert.Equal(t, 1, repo.pages, "no further pages once the limit is reached")
}

func TestSearchPublishedScansAtMost1000Posts(t *testing.T) {
	// El único que coincide es el 1000 (el 1001.º más reciente): queda fuera.
	repo := newPagingPosts(1200, func(i int) string {
		if i == 1000 {
			return "Agentes"
		}
		return "Otro"
	})
	service := NewPostService(repo, time.Now)

	posts, err := service.SearchPublished(t.Context(), "agentes", 0)

	require.NoError(t, err)
	assert.Empty(t, posts)
	assert.Equal(t, maxSearchScan/MaxPostLimit, repo.pages)
}
