package service

import (
	"fmt"
	"strings"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// NormalizeImportedPost aplica a un post que no llega por la API (por ejemplo,
// los de la web anterior, BLOG-076) las mismas reglas que Create: valida el
// título, el contenido, el estado y el slug, y normaliza título, extracto y
// tags como applyPostInput. También valida el texto alternativo de la portada
// como AcceptCover. Devuelve el input normalizado.
func NormalizeImportedPost(input PostInput, coverAlt string) (PostInput, error) {
	if input.Slug == "" {
		return PostInput{}, fmt.Errorf("normalize imported post: %w: slug is required", domain.ErrInvalidInput)
	}

	if err := validatePostInput(input); err != nil {
		return PostInput{}, fmt.Errorf("normalize imported post: %w", err)
	}

	if err := validateCoverField("alt", strings.TrimSpace(coverAlt), MaxCoverAltLength, coverAltPunctuation, domain.ErrInvalidInput); err != nil {
		return PostInput{}, fmt.Errorf("normalize imported post: %w", err)
	}

	input.Title = strings.TrimSpace(input.Title)
	input.Excerpt = strings.TrimSpace(input.Excerpt)
	input.Tags = normalizeTags(input.Tags)

	return input, nil
}
