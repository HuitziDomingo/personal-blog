package handler

import (
	"context"
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	detailImagesDisabled        = "image generation is disabled"
	detailImagesQuotaExceeded   = "image generation quota exhausted, try again tomorrow"
	detailImagesUnavailable     = "image generation is unavailable, try again later"
	detailCoverStoreUnavailable = "cover storage is unavailable, try again later"
	detailInvalidCoverPreview   = "invalid or expired cover preview"
)

// coverPreviewPattern reconoce la ruta que genera una vista previa: la única que
// llama al proveedor de imágenes, y la única con su bucket y su deadline.
var coverPreviewPattern = regexp.MustCompile(`^/api/v1/admin/posts/[^/]+/cover/preview$`)

func isCoverPreview(request *http.Request) bool {
	return request.Method == http.MethodPost && coverPreviewPattern.MatchString(request.URL.Path)
}

// Covers es lo que los handlers necesitan del service de portadas (ADR-026).
type Covers interface {
	Preview(ctx context.Context, userID, postID string) (service.CoverPreview, error)
	Accept(ctx context.Context, userID, postID string, acceptance service.CoverAcceptance) (*domain.Post, error)
}

// GenerateCoverPreview genera la portada del post y la devuelve sin guardarla
// (ADR-026, punto 4).
func (s server) GenerateCoverPreview(ctx context.Context, request gen.GenerateCoverPreviewRequestObject) (gen.GenerateCoverPreviewResponseObject, error) {
	claims, err := requireAdmin(ctx)
	if err != nil {
		return nil, err
	}

	preview, err := s.covers.Preview(ctx, claims.UserID, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.GenerateCoverPreview200JSONResponse{
		Image:       preview.Image,
		ContentType: preview.ContentType,
		Width:       int32(preview.Width),  //nolint:gosec // Es imaging.Width, una constante.
		Height:      int32(preview.Height), //nolint:gosec // Es imaging.Height, una constante.
		Subject:     preview.Subject,
		Alt:         preview.Alt,
		Token:       preview.Token,
		ExpiresAt:   preview.ExpiresAt,
	}, nil
}

// AcceptCover guarda la vista previa y la asigna como portada del post.
func (s server) AcceptCover(ctx context.Context, request gen.AcceptCoverRequestObject) (gen.AcceptCoverResponseObject, error) {
	claims, err := requireAdmin(ctx)
	if err != nil {
		return nil, err
	}

	post, err := s.covers.Accept(ctx, claims.UserID, request.Id, service.CoverAcceptance{
		Image: request.Body.Image,
		Token: request.Body.Token,
		Alt:   request.Body.Alt,
	})
	if err != nil {
		return nil, err
	}

	return gen.AcceptCover200JSONResponse(toPost(post)), nil
}

// RemoveCover deja el post sin portada.
func (s server) RemoveCover(ctx context.Context, request gen.RemoveCoverRequestObject) (gen.RemoveCoverResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	if err := s.posts.RemoveCover(ctx, request.Id); err != nil {
		return nil, err
	}

	return gen.RemoveCover204Response{}, nil
}

// toCover omite la portada de un post sin portada.
func toCover(cover *domain.Cover) *gen.Cover {
	if cover == nil {
		return nil
	}

	return &gen.Cover{Url: cover.URL, Alt: cover.Alt, AiGenerated: cover.AIGenerated}
}

// extendCoverPreviewWriteDeadline alarga el WriteTimeout del servidor solo
// para la vista previa, que espera a Gemini y después al generador de
// imágenes: hasta los dos timeouts seguidos.
func extendCoverPreviewWriteDeadline(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if timeout <= 0 || !isCoverPreview(c.Request) {
			return
		}

		_ = http.NewResponseController(c.Writer).SetWriteDeadline(time.Now().Add(timeout + assistantWriteMargin))
	}
}
