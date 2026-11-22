package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	contextPath = "/api/v1/admin/assistant/improve-with-context"
	statusPath  = "/api/v1/admin/rag/status"
)

// fakeRAG es el RAG para los tests del handler (ADR-015).
type fakeRAG struct {
	excluded []string
	drafts   []domain.Draft
	result   service.ContextualResult
	status   service.RAGStatus
	reindex  service.ReindexResult
	err      error
}

func (f *fakeRAG) ImproveWithContext(_ context.Context, excludePostID string, draft domain.Draft) (service.ContextualResult, error) {
	f.excluded = append(f.excluded, excludePostID)
	f.drafts = append(f.drafts, draft)

	return f.result, f.err
}

func (f *fakeRAG) Reindex(context.Context) (service.ReindexResult, error) {
	return f.reindex, f.err
}

func (f *fakeRAG) Status(context.Context) (service.RAGStatus, error) {
	return f.status, f.err
}

func ragRouter(t *testing.T, rag *fakeRAG) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.RAG = rag
	cfg.MaxBodyBytes = 1 << 20

	return newTestRouterWith(t, cfg)
}

func TestImproveWithContextReturnsSuggestionAndSources(t *testing.T) {
	rag := &fakeRAG{result: service.ContextualResult{
		Suggestion: domain.ContextualSuggestion{
			Suggestion:     "- Enlaza el post anterior.",
			InternalLinks:  []domain.InternalLink{{Slug: "orquestar-agentes", Reason: "En la intro."}},
			Contradictions: []domain.Contradiction{{Slug: "orquestar-agentes", Note: "Uno contra varios."}},
		},
		Context: []domain.ContextChunk{{PostID: "p1", Slug: "orquestar-agentes", PostTitle: "Orquestar agentes", Section: "Herramientas", Text: "no se devuelve", Score: 0.81}},
	}}

	body := `{"postId":"p9","title":"Hola","content":"# Hola\n\nBorrador."}`
	response := send(ragRouter(t, rag), http.MethodPost, contextPath, body, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{
		"suggestion": "- Enlaza el post anterior.",
		"internalLinks": [{"slug": "orquestar-agentes", "reason": "En la intro."}],
		"contradictions": [{"slug": "orquestar-agentes", "note": "Uno contra varios."}],
		"context": [{"postId": "p1", "slug": "orquestar-agentes", "title": "Orquestar agentes", "section": "Herramientas", "score": 0.81}]
	}`, response.Body.String())
	assert.Equal(t, []string{"p9"}, rag.excluded)
	assert.Equal(t, []domain.Draft{{Title: "Hola", Content: "# Hola\n\nBorrador."}}, rag.drafts)
}

// Sin contexto, las listas van vacías y no nulas.
func TestImproveWithContextWithoutContextReturnsEmptyLists(t *testing.T) {
	rag := &fakeRAG{result: service.ContextualResult{Suggestion: domain.ContextualSuggestion{Suggestion: "Sugerencia."}}}

	response := send(ragRouter(t, rag), http.MethodPost, contextPath, draftBody, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"suggestion":"Sugerencia.","internalLinks":[],"contradictions":[],"context":[]}`, response.Body.String())
	assert.Equal(t, []string{""}, rag.excluded, "sin postId no se excluye ningún post")
}

func TestRAGOperationsRequireAnAdmin(t *testing.T) {
	router := ragRouter(t, &fakeRAG{})

	for _, request := range []struct{ method, path, body string }{
		{http.MethodPost, contextPath, draftBody},
		{http.MethodGet, statusPath, ""},
		{http.MethodPost, reindexPath, ""},
	} {
		t.Run(request.path, func(t *testing.T) {
			assert.Equal(t, http.StatusUnauthorized, send(router, request.method, request.path, request.body, nil).Code)
			assert.Equal(t, http.StatusForbidden, send(router, request.method, request.path, request.body, withCookies(accessCookie(editorAccessToken))).Code)
		})
	}
}

func TestImproveWithContextValidatesTheDraft(t *testing.T) {
	rag := &fakeRAG{}
	router := ragRouter(t, rag)

	for name, body := range map[string]string{
		"empty content":    `{"title":"","content":""}`,
		"content too long": fmt.Sprintf(`{"title":"","content":%q}`, strings.Repeat("a", 50001)),
		"post id too long": fmt.Sprintf(`{"postId":%q,"title":"","content":"x"}`, strings.Repeat("a", 65)),
	} {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, http.StatusBadRequest, send(router, http.MethodPost, contextPath, body, adminSession()).Code)
		})
	}

	assert.Empty(t, rag.drafts)
}

func TestRAGErrors(t *testing.T) {
	tests := []struct {
		err    error
		detail string
	}{
		{domain.ErrRAGDisabled, detailRAGDisabled},
		{fmt.Errorf("embed query: %w", domain.ErrAssistantUnavailable), detailAssistantUnavailable},
		{fmt.Errorf("x: %w", domain.ErrAssistantInvalidOutput), detailAssistantInvalidOutput},
	}

	for _, tt := range tests {
		t.Run(tt.detail, func(t *testing.T) {
			router := ragRouter(t, &fakeRAG{err: tt.err})

			for _, request := range []struct{ path, body string }{{contextPath, draftBody}, {reindexPath, ""}} {
				response := send(router, http.MethodPost, request.path, request.body, adminSession())

				require.Equal(t, http.StatusServiceUnavailable, response.Code, request.path)
				assert.Contains(t, response.Body.String(), tt.detail)
			}
		})
	}
}

func TestGetRagStatus(t *testing.T) {
	rag := &fakeRAG{status: service.RAGStatus{Enabled: true, Model: "gemini-embedding-2", PublishedPosts: 5, IndexedPosts: 4, PendingPosts: 1, Chunks: 23}}

	response := send(ragRouter(t, rag), http.MethodGet, statusPath, "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"enabled":true,"model":"gemini-embedding-2","publishedPosts":5,"indexedPosts":4,"pendingPosts":1,"chunks":23}`, response.Body.String())
}

// Con el RAG apagado, el estado responde 200 con enabled: false: el admin lo
// usa para ocultar los botones.
func TestGetRagStatusWhenDisabled(t *testing.T) {
	cfg := testRouterConfig()
	cfg.RAG = service.NewDisabledRAG()

	response := send(newTestRouterWith(t, cfg), http.MethodGet, statusPath, "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"enabled":false,"model":"","publishedPosts":0,"indexedPosts":0,"pendingPosts":0,"chunks":0}`, response.Body.String())
}

func TestReindexPosts(t *testing.T) {
	rag := &fakeRAG{reindex: service.ReindexResult{Posts: 5, Indexed: 3, Pending: 2, Removed: 1, Chunks: 12}}

	response := send(ragRouter(t, rag), http.MethodPost, reindexPath, "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"posts":5,"indexed":3,"pending":2,"removed":1,"chunks":12}`, response.Body.String())
}

// «Mejorar con contexto» y el reindexado gastan cuota del proveedor: usan el
// bucket del asistente. El estado no llama a ningún proveedor.
func TestRAGOperationsShareTheAssistantBucket(t *testing.T) {
	router := bucketsRouter(t, RateLimits{Assistant: RateLimit{PerMinute: 1, Burst: 1}})

	assert.Equal(t, http.StatusOK, send(router, http.MethodPost, contextPath, draftBody, adminSession()).Code)
	assert.Equal(t, http.StatusTooManyRequests, send(router, http.MethodPost, reindexPath, "", adminSession()).Code)
	assert.Equal(t, http.StatusOK, send(router, http.MethodGet, statusPath, "", adminSession()).Code)
}
