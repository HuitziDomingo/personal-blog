package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	// reindexPath gasta cuota de embeddings: comparte el bucket del
	// asistente y tiene su propio deadline de escritura.
	reindexPath = "/api/v1/admin/rag/reindex"

	detailRAGDisabled = "rag is disabled"
)

// RAG es lo que los handlers necesitan del RAG (ADR-027).
type RAG interface {
	ImproveWithContext(ctx context.Context, excludePostID string, draft domain.Draft) (service.ContextualResult, error)
	Reindex(ctx context.Context) (service.ReindexResult, error)
	Status(ctx context.Context) (service.RAGStatus, error)
}

// ImproveWithContext devuelve la sugerencia con el contexto de los posts
// publicados y los fragmentos usados. No guarda nada.
func (s server) ImproveWithContext(ctx context.Context, request gen.ImproveWithContextRequestObject) (gen.ImproveWithContextResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	body := *request.Body

	excludePostID := ""
	if body.PostId != nil {
		excludePostID = *body.PostId
	}

	result, err := s.rag.ImproveWithContext(ctx, excludePostID, domain.Draft{Title: body.Title, Content: body.Content})
	if err != nil {
		return nil, err
	}

	response := gen.ImproveWithContext200JSONResponse{
		Suggestion:     result.Suggestion.Suggestion,
		InternalLinks:  make([]gen.InternalLink, 0, len(result.Suggestion.InternalLinks)),
		Contradictions: make([]gen.Contradiction, 0, len(result.Suggestion.Contradictions)),
		Context:        make([]gen.ContextSource, 0, len(result.Context)),
	}

	for _, link := range result.Suggestion.InternalLinks {
		response.InternalLinks = append(response.InternalLinks, gen.InternalLink{Slug: link.Slug, Reason: link.Reason})
	}

	for _, contradiction := range result.Suggestion.Contradictions {
		response.Contradictions = append(response.Contradictions, gen.Contradiction{Slug: contradiction.Slug, Note: contradiction.Note})
	}

	for _, chunk := range result.Context {
		response.Context = append(response.Context, gen.ContextSource{
			PostId:  chunk.PostID,
			Slug:    chunk.Slug,
			Title:   chunk.PostTitle,
			Section: chunk.Section,
			Score:   chunk.Score,
		})
	}

	return response, nil
}

// GetRagStatus devuelve el estado del índice; con el RAG apagado,
// enabled: false.
func (s server) GetRagStatus(ctx context.Context, _ gen.GetRagStatusRequestObject) (gen.GetRagStatusResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	status, err := s.rag.Status(ctx)
	if err != nil {
		return nil, err
	}

	return gen.GetRagStatus200JSONResponse{
		Enabled:        status.Enabled,
		Model:          status.Model,
		PublishedPosts: status.PublishedPosts,
		IndexedPosts:   status.IndexedPosts,
		PendingPosts:   status.PendingPosts,
		Chunks:         status.Chunks,
	}, nil
}

// ReindexPosts reconstruye el índice.
func (s server) ReindexPosts(ctx context.Context, _ gen.ReindexPostsRequestObject) (gen.ReindexPostsResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	result, err := s.rag.Reindex(ctx)
	if err != nil {
		return nil, err
	}

	return gen.ReindexPosts200JSONResponse{
		Posts:   result.Posts,
		Indexed: result.Indexed,
		Pending: result.Pending,
		Removed: result.Removed,
		Chunks:  result.Chunks,
	}, nil
}

// WriteDeadlines son los tiempos de las rutas que esperan a un proveedor
// de IA más que el WriteTimeout general.
type WriteDeadlines struct {
	// Assistant es lo que puede tardar una operación del asistente: el
	// timeout del proveedor, más el embedding de la consulta en «mejorar con
	// contexto».
	Assistant time.Duration
	// Reindex es lo que puede tardar el reindexado completo.
	Reindex time.Duration
}

// extendWriteDeadlines alarga el WriteTimeout del servidor solo para las
// rutas del asistente y el reindexado. Subir ese límite para todas las rutas
// daría más tiempo a cualquier cliente lento.
func extendWriteDeadlines(deadlines WriteDeadlines) gin.HandlerFunc {
	return func(c *gin.Context) {
		var timeout time.Duration

		switch path := c.Request.URL.Path; {
		case strings.HasPrefix(path, assistantPathPrefix):
			timeout = deadlines.Assistant
		case path == reindexPath:
			timeout = deadlines.Reindex
		}

		if timeout <= 0 {
			return
		}

		// Falla si el writer no lo soporta (por ejemplo, httptest en los
		// tests): entonces no hay deadline que alargar.
		_ = http.NewResponseController(c.Writer).SetWriteDeadline(time.Now().Add(timeout + assistantWriteMargin))
	}
}
