package domain

import (
	"context"
	"time"
)

// PostStatus es el estado editorial de un post.
type PostStatus string

// Estados editoriales válidos de un post.
const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusPublished PostStatus = "published"
	PostStatusArchived  PostStatus = "archived"
)

// IsValid indica si el estado pertenece al enum.
func (s PostStatus) IsValid() bool {
	switch s {
	case PostStatusDraft, PostStatusPublished, PostStatusArchived:
		return true
	default:
		return false
	}
}

// SEO agrupa los metadatos para buscadores y redes sociales.
type SEO struct {
	Title        string
	Description  string
	Keywords     []string
	CanonicalURL string
	OGImageURL   string
}

// Post es un artículo del blog con contenido en Markdown.
type Post struct {
	ID          string
	AuthorID    string
	Title       string
	Slug        string
	Excerpt     string
	Content     string
	Tags        []string
	Status      PostStatus
	SEO         SEO
	PublishedAt *time.Time // nil mientras no se haya publicado.
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// PostFilter acota un listado de posts. Los campos en su valor cero no filtran.
type PostFilter struct {
	Status PostStatus
	Tag    string
	Limit  int
	Offset int
}

// PostRepository es el puerto de persistencia de posts.
type PostRepository interface {
	// Create devuelve ErrDuplicateSlug si el slug ya está en uso.
	Create(ctx context.Context, post *Post) error
	// GetByID devuelve ErrNotFound si el post no existe.
	GetByID(ctx context.Context, id string) (*Post, error)
	// GetBySlug devuelve ErrNotFound si el post no existe.
	GetBySlug(ctx context.Context, slug string) (*Post, error)
	// List devuelve la página solicitada y el total de posts que cumplen el filtro.
	List(ctx context.Context, filter PostFilter) ([]*Post, int64, error)
	// Update devuelve ErrNotFound si el post no existe y ErrDuplicateSlug si
	// el nuevo slug ya está en uso.
	Update(ctx context.Context, post *Post) error
	// Delete devuelve ErrNotFound si el post no existe.
	Delete(ctx context.Context, id string) error
}
