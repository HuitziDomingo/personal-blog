package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// Límites de SearchPublished.
const (
	// MaxSearchQueryLength acota el texto buscado.
	MaxSearchQueryLength = 200
	// maxSearchScan acota cuántos posts publicados se recorren por búsqueda.
	maxSearchScan = 1000
)

// SearchPublished busca posts publicados cuyo título, extracto, contenido o
// etiquetas contengan query, sin distinguir mayúsculas. Devuelve hasta limit
// (DefaultPostLimit si es 0, MaxPostLimit como máximo), del publicado más
// recientemente al más antiguo.
//
// Filtra en memoria sobre los publicados, sin construir consultas de MongoDB
// con texto del usuario (ADR-010, punto 1): basta para el volumen de un blog
// personal, y recorre como mucho maxSearchScan posts.
func (s *PostService) SearchPublished(ctx context.Context, query string, limit int) ([]*domain.Post, error) {
	needle := strings.ToLower(strings.TrimSpace(query))
	if needle == "" || utf8.RuneCountInString(needle) > MaxSearchQueryLength {
		return nil, fmt.Errorf("search published posts: %w: query must have 1 to %d characters", domain.ErrInvalidInput, MaxSearchQueryLength)
	}

	limit, _, err := normalizePage(limit, 0)
	if err != nil {
		return nil, fmt.Errorf("search published posts: %w", err)
	}

	found := []*domain.Post{}
	for offset := 0; offset < maxSearchScan; offset += MaxPostLimit {
		page, err := s.ListPublished(ctx, "", MaxPostLimit, offset)
		if err != nil {
			return nil, fmt.Errorf("search published posts: %w", err)
		}

		for _, post := range page.Posts {
			if matches(post, needle) {
				found = append(found, post)
				if len(found) == limit {
					return found, nil
				}
			}
		}

		if len(page.Posts) == 0 || int64(offset+len(page.Posts)) >= page.Total {
			break
		}
	}

	return found, nil
}

func matches(post *domain.Post, needle string) bool {
	for _, field := range append([]string{post.Title, post.Excerpt, post.Content}, post.Tags...) {
		if strings.Contains(strings.ToLower(field), needle) {
			return true
		}
	}

	return false
}
