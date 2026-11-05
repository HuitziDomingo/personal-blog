package handler

import (
	"context"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

// Posts es lo que los handlers necesitan del service de posts.
type Posts interface {
	Create(ctx context.Context, authorID string, input service.PostInput) (*domain.Post, error)
	Update(ctx context.Context, id string, input service.PostInput) (*domain.Post, error)
	Archive(ctx context.Context, id string) error
	Get(ctx context.Context, id string) (*domain.Post, error)
	List(ctx context.Context, params service.PostListParams) (service.PostPage, error)
	GetPublished(ctx context.Context, slug string) (*domain.Post, error)
	ListPublished(ctx context.Context, tag string, limit, offset int) (service.PostPage, error)
}

// ListPublishedPosts lista los posts publicados, del más reciente al más antiguo.
func (s server) ListPublishedPosts(ctx context.Context, request gen.ListPublishedPostsRequestObject) (gen.ListPublishedPostsResponseObject, error) {
	params := request.Params

	page, err := s.posts.ListPublished(ctx, deref(params.Tag), int(deref(params.Limit)), int(deref(params.Offset)))
	if err != nil {
		return nil, err
	}

	return gen.ListPublishedPosts200JSONResponse(toPostPage(page)), nil
}

// GetPublishedPost devuelve un post publicado. Un borrador o un archivado
// responden 404, igual que un slug que no existe.
func (s server) GetPublishedPost(ctx context.Context, request gen.GetPublishedPostRequestObject) (gen.GetPublishedPostResponseObject, error) {
	post, err := s.posts.GetPublished(ctx, request.Slug)
	if err != nil {
		return nil, err
	}

	return gen.GetPublishedPost200JSONResponse(toPost(post)), nil
}

// ListPosts lista posts en cualquier estado para el admin.
func (s server) ListPosts(ctx context.Context, request gen.ListPostsRequestObject) (gen.ListPostsResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	params := request.Params

	page, err := s.posts.List(ctx, service.PostListParams{
		Status: domain.PostStatus(deref(params.Status)),
		Tag:    deref(params.Tag),
		Limit:  int(deref(params.Limit)),
		Offset: int(deref(params.Offset)),
	})
	if err != nil {
		return nil, err
	}

	return gen.ListPosts200JSONResponse(toPostPage(page)), nil
}

// CreatePost crea un post a nombre del usuario de la sesión.
func (s server) CreatePost(ctx context.Context, request gen.CreatePostRequestObject) (gen.CreatePostResponseObject, error) {
	claims, err := requireAdmin(ctx)
	if err != nil {
		return nil, err
	}

	post, err := s.posts.Create(ctx, claims.UserID, toPostInput(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.CreatePost201JSONResponse(toPost(post)), nil
}

// GetPost devuelve un post en cualquier estado. Un ID con formato inválido
// responde 404 (ADR-010): el repositorio lo trata como inexistente.
func (s server) GetPost(ctx context.Context, request gen.GetPostRequestObject) (gen.GetPostResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	post, err := s.posts.Get(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.GetPost200JSONResponse(toPost(post)), nil
}

// UpdatePost reemplaza los datos editables de un post.
func (s server) UpdatePost(ctx context.Context, request gen.UpdatePostRequestObject) (gen.UpdatePostResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	post, err := s.posts.Update(ctx, request.Id, toPostInput(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.UpdatePost200JSONResponse(toPost(post)), nil
}

// DeletePost archiva el post: no hay borrado físico.
func (s server) DeletePost(ctx context.Context, request gen.DeletePostRequestObject) (gen.DeletePostResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	if err := s.posts.Archive(ctx, request.Id); err != nil {
		return nil, err
	}

	return gen.DeletePost204Response{}, nil
}

// requireAdmin devuelve los claims de la sesión si son de un administrador.
// El validador ya exigió un access token válido; el rol se comprueba aquí.
func requireAdmin(ctx context.Context) (service.AccessClaims, error) {
	claims, ok := claimsFrom(ctx)
	if !ok {
		return service.AccessClaims{}, domain.ErrInvalidToken
	}

	if claims.Role != domain.UserRoleAdmin {
		return service.AccessClaims{}, domain.ErrForbidden
	}

	return claims, nil
}

func toPostInput(body gen.PostWrite) service.PostInput {
	input := service.PostInput{
		Title:   body.Title,
		Slug:    deref(body.Slug),
		Excerpt: deref(body.Excerpt),
		Content: body.Content,
		Tags:    deref(body.Tags),
		Status:  domain.PostStatus(body.Status),
	}

	if body.Seo != nil {
		input.SEO = domain.SEO{
			Title:        deref(body.Seo.Title),
			Description:  deref(body.Seo.Description),
			Keywords:     deref(body.Seo.Keywords),
			CanonicalURL: deref(body.Seo.CanonicalUrl),
			OGImageURL:   deref(body.Seo.OgImageUrl),
		}
	}

	return input
}

func toPost(post *domain.Post) gen.Post {
	return gen.Post{
		Id:          post.ID,
		AuthorId:    post.AuthorID,
		Title:       post.Title,
		Slug:        post.Slug,
		Excerpt:     &post.Excerpt,
		Content:     post.Content,
		Tags:        nonNil(post.Tags),
		Status:      gen.PostStatus(post.Status),
		Seo:         toSeo(post.SEO),
		PublishedAt: post.PublishedAt,
		CreatedAt:   post.CreatedAt,
		UpdatedAt:   post.UpdatedAt,
	}
}

func toPostSummary(post *domain.Post) gen.PostSummary {
	return gen.PostSummary{
		Id:          post.ID,
		AuthorId:    post.AuthorID,
		Title:       post.Title,
		Slug:        post.Slug,
		Excerpt:     &post.Excerpt,
		Tags:        nonNil(post.Tags),
		Status:      gen.PostStatus(post.Status),
		PublishedAt: post.PublishedAt,
		CreatedAt:   post.CreatedAt,
		UpdatedAt:   post.UpdatedAt,
	}
}

func toPostPage(page service.PostPage) gen.PostPage {
	items := make([]gen.PostSummary, 0, len(page.Posts))
	for _, post := range page.Posts {
		items = append(items, toPostSummary(post))
	}

	return gen.PostPage{
		Items:  items,
		Total:  page.Total,
		Limit:  int32(page.Limit),  //nolint:gosec // El service acota limit a MaxPostLimit.
		Offset: int32(page.Offset), //nolint:gosec // El service acota offset a MaxPostOffset.
	}
}

// toSeo omite los campos vacíos: el contrato los declara opcionales y las URLs
// vacías no serían un "uri" válido.
func toSeo(seo domain.SEO) *gen.Seo {
	keywords := nonNil(seo.Keywords)

	return &gen.Seo{
		Title:        optional(seo.Title),
		Description:  optional(seo.Description),
		Keywords:     &keywords,
		CanonicalUrl: optional(seo.CanonicalURL),
		OgImageUrl:   optional(seo.OGImageURL),
	}
}

// deref devuelve el valor de un parámetro opcional, o su valor cero si falta.
func deref[T any](value *T) T {
	if value == nil {
		var zero T
		return zero
	}

	return *value
}

func optional(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}
