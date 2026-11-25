package service

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func importedInput() PostInput {
	return PostInput{
		Title:   "  Métodos de Array ",
		Slug:    "arreglos",
		Excerpt: " Extracto. ",
		Content: "# Hola",
		Tags:    []string{"JavaScript", "javascript", " Type  Script "},
		Status:  domain.PostStatusPublished,
	}
}

func TestNormalizeImportedPost(t *testing.T) {
	got, err := NormalizeImportedPost(importedInput(), "Fragmento de código JavaScript")
	require.NoError(t, err)

	assert.Equal(t, "Métodos de Array", got.Title)
	assert.Equal(t, "Extracto.", got.Excerpt)
	assert.Equal(t, []string{"javascript", "type script"}, got.Tags)
	assert.Equal(t, "# Hola", got.Content)
}

func TestNormalizeImportedPostAppliesTheAPIRules(t *testing.T) {
	for name, change := range map[string]func(*PostInput, *string){
		"sin slug":         func(i *PostInput, _ *string) { i.Slug = "" },
		"slug inválido":    func(i *PostInput, _ *string) { i.Slug = "Arreglos_JS" },
		"slug largo":       func(i *PostInput, _ *string) { i.Slug = strings.Repeat("a", MaxSlugLength+1) },
		"sin título":       func(i *PostInput, _ *string) { i.Title = " " },
		"sin contenido":    func(i *PostInput, _ *string) { i.Content = "" },
		"estado inventado": func(i *PostInput, _ *string) { i.Status = "deleted" },
		"sin alt":          func(_ *PostInput, alt *string) { *alt = "" },
		"alt con <":        func(_ *PostInput, alt *string) { *alt = "<script>" },
	} {
		t.Run(name, func(t *testing.T) {
			input := importedInput()
			alt := "Portada"
			change(&input, &alt)

			_, err := NormalizeImportedPost(input, alt)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}
