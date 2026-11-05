package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// Límites de paginación; coinciden con el contrato (docs/api/openapi.yaml).
const (
	DefaultPostLimit = 20
	MaxPostLimit     = 100
	MaxPostOffset    = 10000
)

const (
	// maxSlugAttempts es cuántas veces se intenta guardar un post con slug
	// generado cuando otra petición toma el mismo slug entre la búsqueda del
	// sufijo libre y el insert.
	maxSlugAttempts = 5
	// maxSlugLookups acota la búsqueda del primer sufijo libre.
	maxSlugLookups = 100
)

// PostInput son los datos editables de un post. Slug y Excerpt son opcionales:
// vacíos, se generan del título y del contenido.
type PostInput struct {
	Title   string
	Slug    string
	Excerpt string
	Content string
	Tags    []string
	Status  domain.PostStatus
	SEO     domain.SEO
}

// PostListParams acota un listado. Status y Tag vacíos no filtran y Limit 0
// usa DefaultPostLimit.
type PostListParams struct {
	Status domain.PostStatus
	Tag    string
	Limit  int
	Offset int
}

// PostPage es una página de posts con el total que cumple el filtro.
type PostPage struct {
	Posts  []*domain.Post
	Total  int64
	Limit  int
	Offset int
}

// PostService aplica las reglas de negocio de los posts.
type PostService struct {
	posts domain.PostRepository
	now   func() time.Time
}

// NewPostService crea el service.
func NewPostService(posts domain.PostRepository, now func() time.Time) *PostService {
	return &PostService{posts: posts, now: now}
}

// timestamp devuelve la hora actual con la precisión con la que MongoDB guarda
// las fechas (milisegundos). Así el post que devuelve una escritura es igual
// al que devuelve una lectura posterior.
func (s *PostService) timestamp() time.Time {
	return s.now().UTC().Truncate(time.Millisecond)
}

// Create guarda un post nuevo. Un slug enviado que ya existe devuelve
// domain.ErrDuplicateSlug; uno generado del título recibe un sufijo libre.
func (s *PostService) Create(ctx context.Context, authorID string, input PostInput) (*domain.Post, error) {
	if err := validatePostInput(input); err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}

	now := s.timestamp()
	post := &domain.Post{AuthorID: authorID, CreatedAt: now}
	applyPostInput(post, input, now)

	if input.Slug != "" {
		post.Slug = input.Slug

		if err := s.posts.Create(ctx, post); err != nil {
			return nil, fmt.Errorf("create post: %w", err)
		}

		return post, nil
	}

	base := Slugify(input.Title)
	if base == "" {
		return nil, fmt.Errorf("create post: %w: title has no characters to build a slug from, send one", domain.ErrInvalidInput)
	}

	if err := s.createWithGeneratedSlug(ctx, post, base); err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}

	return post, nil
}

// createWithGeneratedSlug busca el primer sufijo libre y, si otra petición lo
// toma antes del insert, prueba con el siguiente, hasta maxSlugAttempts veces.
// El índice único de slug es quien decide: la búsqueda solo evita reintentos.
func (s *PostService) createWithGeneratedSlug(ctx context.Context, post *domain.Post, base string) error {
	n, err := s.firstFreeSlugSuffix(ctx, base)
	if err != nil {
		return err
	}

	for attempt := 1; ; attempt++ {
		post.Slug = slugWithSuffix(base, n)

		err := s.posts.Create(ctx, post)
		if !errors.Is(err, domain.ErrDuplicateSlug) {
			return err
		}

		if attempt == maxSlugAttempts {
			return fmt.Errorf("generate slug from %q after %d attempts: %w", base, maxSlugAttempts, err)
		}

		n++
	}
}

func (s *PostService) firstFreeSlugSuffix(ctx context.Context, base string) (int, error) {
	for n := 1; n <= maxSlugLookups; n++ {
		_, err := s.posts.GetBySlug(ctx, slugWithSuffix(base, n))
		if errors.Is(err, domain.ErrNotFound) {
			return n, nil
		}

		if err != nil {
			return 0, fmt.Errorf("find free slug: %w", err)
		}
	}

	return 0, fmt.Errorf("find free slug for %q: %w", base, domain.ErrDuplicateSlug)
}

// Update reemplaza los datos editables. Un slug vacío conserva el actual. El
// slug solo cambia mientras el post es un borrador que nunca se publicó; si
// no, devuelve domain.ErrSlugLocked.
func (s *PostService) Update(ctx context.Context, id string, input PostInput) (*domain.Post, error) {
	if err := validatePostInput(input); err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}

	post, err := s.posts.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}

	if input.Slug != "" && input.Slug != post.Slug {
		if !slugEditable(post) {
			return nil, fmt.Errorf("update post: %w", domain.ErrSlugLocked)
		}

		post.Slug = input.Slug
	}

	applyPostInput(post, input, s.timestamp())

	if err := s.posts.Update(ctx, post); err != nil {
		return nil, fmt.Errorf("update post: %w", err)
	}

	return post, nil
}

// Archive cambia el post a archived. Es el borrado de la API: no hay borrado
// físico. Archivar un post archivado no hace nada.
func (s *PostService) Archive(ctx context.Context, id string) error {
	post, err := s.posts.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("archive post: %w", err)
	}

	if post.Status == domain.PostStatusArchived {
		return nil
	}

	post.Status = domain.PostStatusArchived
	post.UpdatedAt = s.timestamp()

	if err := s.posts.Update(ctx, post); err != nil {
		return fmt.Errorf("archive post: %w", err)
	}

	return nil
}

// Get devuelve un post en cualquier estado.
func (s *PostService) Get(ctx context.Context, id string) (*domain.Post, error) {
	post, err := s.posts.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get post: %w", err)
	}

	return post, nil
}

// List devuelve posts en cualquier estado, del editado más recientemente al
// más antiguo.
func (s *PostService) List(ctx context.Context, params PostListParams) (PostPage, error) {
	if params.Status != "" && !params.Status.IsValid() {
		return PostPage{}, fmt.Errorf("list posts: %w: unknown status %q", domain.ErrInvalidInput, params.Status)
	}

	return s.list(ctx, params, domain.PostOrderUpdatedDesc)
}

// GetPublished devuelve un post publicado. Un post en otro estado no existe
// para la API pública: devuelve domain.ErrNotFound.
func (s *PostService) GetPublished(ctx context.Context, slug string) (*domain.Post, error) {
	post, err := s.posts.GetBySlug(ctx, slug)
	if err != nil {
		return nil, fmt.Errorf("get published post: %w", err)
	}

	if post.Status != domain.PostStatusPublished {
		return nil, fmt.Errorf("get published post: %w", domain.ErrNotFound)
	}

	return post, nil
}

// ListPublished devuelve solo posts publicados, del publicado más
// recientemente al más antiguo.
func (s *PostService) ListPublished(ctx context.Context, tag string, limit, offset int) (PostPage, error) {
	params := PostListParams{Status: domain.PostStatusPublished, Tag: tag, Limit: limit, Offset: offset}

	return s.list(ctx, params, domain.PostOrderPublishedDesc)
}

func (s *PostService) list(ctx context.Context, params PostListParams, order domain.PostOrder) (PostPage, error) {
	limit, offset, err := normalizePage(params.Limit, params.Offset)
	if err != nil {
		return PostPage{}, fmt.Errorf("list posts: %w", err)
	}

	posts, total, err := s.posts.List(ctx, domain.PostFilter{
		Status: params.Status,
		Tag:    normalizeTag(params.Tag),
		Order:  order,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return PostPage{}, fmt.Errorf("list posts: %w", err)
	}

	return PostPage{Posts: posts, Total: total, Limit: limit, Offset: offset}, nil
}

func normalizePage(limit, offset int) (int, int, error) {
	if limit == 0 {
		limit = DefaultPostLimit
	}

	if limit < 1 || limit > MaxPostLimit {
		return 0, 0, fmt.Errorf("%w: limit must be between 1 and %d", domain.ErrInvalidInput, MaxPostLimit)
	}

	if offset < 0 || offset > MaxPostOffset {
		return 0, 0, fmt.Errorf("%w: offset must be between 0 and %d", domain.ErrInvalidInput, MaxPostOffset)
	}

	return limit, offset, nil
}

func validatePostInput(input PostInput) error {
	switch {
	case strings.TrimSpace(input.Title) == "":
		return fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	case strings.TrimSpace(input.Content) == "":
		return fmt.Errorf("%w: content is required", domain.ErrInvalidInput)
	case !input.Status.IsValid():
		return fmt.Errorf("%w: unknown status %q", domain.ErrInvalidInput, input.Status)
	case input.Slug != "" && !validSlug(input.Slug):
		return fmt.Errorf("%w: slug must match %s and have at most %d characters", domain.ErrInvalidInput, slugPattern, MaxSlugLength)
	default:
		return nil
	}
}

// applyPostInput copia los datos editables, salvo el slug. El contenido se
// guarda tal cual (ADR-010). PublishedAt se fija solo la primera vez que el
// post se publica.
func applyPostInput(post *domain.Post, input PostInput, now time.Time) {
	post.Title = strings.TrimSpace(input.Title)
	post.Content = input.Content
	post.Tags = normalizeTags(input.Tags)
	post.Status = input.Status
	post.SEO = input.SEO
	post.UpdatedAt = now

	post.Excerpt = strings.TrimSpace(input.Excerpt)
	if post.Excerpt == "" {
		post.Excerpt = GenerateExcerpt(input.Content)
	}

	if post.Status == domain.PostStatusPublished && post.PublishedAt == nil {
		publishedAt := now
		post.PublishedAt = &publishedAt
	}
}

// slugEditable indica si el slug todavía puede cambiar: solo en un borrador
// que nunca se publicó, porque un post publicado ya tiene links.
func slugEditable(post *domain.Post) bool {
	return post.Status == domain.PostStatusDraft && post.PublishedAt == nil
}

// normalizeTags pasa las etiquetas a minúsculas, colapsa los espacios y quita
// las vacías y las repetidas, conservando el orden.
func normalizeTags(tags []string) []string {
	normalized := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))

	for _, tag := range tags {
		tag = normalizeTag(tag)
		if tag == "" {
			continue
		}

		if _, ok := seen[tag]; ok {
			continue
		}

		seen[tag] = struct{}{}
		normalized = append(normalized, tag)
	}

	return normalized
}

func normalizeTag(tag string) string {
	return strings.Join(strings.Fields(strings.ToLower(tag)), " ")
}
