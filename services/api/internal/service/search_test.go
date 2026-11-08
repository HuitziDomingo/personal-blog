package service

import (
	"strings"
	"testing"

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
