package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const (
	assistantPathPrefix = "/api/v1/admin/assistant/"

	detailAssistantDisabled      = "writing assistant is disabled"
	detailAssistantUnavailable   = "writing assistant is unavailable, try again later"
	detailAssistantInvalidOutput = "writing assistant returned an invalid suggestion, try again"

	// assistantWriteMargin es lo que se suma al timeout del proveedor para
	// escribir la respuesta.
	assistantWriteMargin = 10 * time.Second
)

// Assistant es lo que los handlers necesitan del asistente de escritura.
type Assistant interface {
	ImproveWriting(ctx context.Context, draft domain.Draft) (string, error)
	SuggestMetadata(ctx context.Context, draft domain.Draft) (domain.MetadataSuggestion, error)
}

// ImproveWriting devuelve el contenido del borrador reescrito. No guarda nada.
func (s server) ImproveWriting(ctx context.Context, request gen.ImproveWritingRequestObject) (gen.ImproveWritingResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	content, err := s.assistant.ImproveWriting(ctx, toDraft(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.ImproveWriting200JSONResponse{Content: content}, nil
}

// SuggestMetadata devuelve título, extracto y etiquetas para el borrador. No
// guarda nada.
func (s server) SuggestMetadata(ctx context.Context, request gen.SuggestMetadataRequestObject) (gen.SuggestMetadataResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	suggestion, err := s.assistant.SuggestMetadata(ctx, toDraft(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.SuggestMetadata200JSONResponse{
		Title:   suggestion.Title,
		Excerpt: suggestion.Excerpt,
		Tags:    nonNil(suggestion.Tags),
	}, nil
}

func toDraft(body gen.AssistantDraft) domain.Draft {
	return domain.Draft{Title: body.Title, Content: body.Content}
}

// extendAssistantWriteDeadline alarga el WriteTimeout del servidor solo para el
// asistente: la llamada al proveedor puede tardar hasta su timeout, más que el
// WriteTimeout general. Subir ese límite para todas las rutas daría más tiempo
// a cualquier cliente lento.
func extendAssistantWriteDeadline(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if timeout <= 0 || !strings.HasPrefix(c.Request.URL.Path, assistantPathPrefix) {
			return
		}

		// Falla si el writer no lo soporta (por ejemplo, httptest en los
		// tests): entonces no hay deadline que alargar.
		_ = http.NewResponseController(c.Writer).SetWriteDeadline(time.Now().Add(timeout + assistantWriteMargin))
	}
}
