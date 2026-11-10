package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	improvePath  = "/api/v1/admin/assistant/improve-writing"
	metadataPath = "/api/v1/admin/assistant/suggest-metadata"
	draftBody    = `{"title":"Hola","content":"# Hola\n\nBorrador."}`
)

// fakeAssistant es el asistente para los tests del handler (ADR-015).
type fakeAssistant struct {
	drafts   []domain.Draft
	improved string
	metadata domain.MetadataSuggestion
	err      error
	// wait se espera antes de responder, para probar el deadline de escritura.
	wait time.Duration
}

func (f *fakeAssistant) ImproveWriting(_ context.Context, draft domain.Draft) (string, error) {
	f.drafts = append(f.drafts, draft)
	time.Sleep(f.wait)

	return f.improved, f.err
}

func (f *fakeAssistant) SuggestMetadata(_ context.Context, draft domain.Draft) (domain.MetadataSuggestion, error) {
	f.drafts = append(f.drafts, draft)

	return f.metadata, f.err
}

func assistantRouter(t *testing.T, assistant *fakeAssistant) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.Assistant = assistant
	// Que el límite de cuerpo no tape al validador del contrato con borradores
	// largos.
	cfg.MaxBodyBytes = 1 << 20

	return newTestRouterWith(t, cfg)
}

func TestImproveWriting(t *testing.T) {
	assistant := &fakeAssistant{improved: "# Hola\n\nBorrador mejorado."}

	response := send(assistantRouter(t, assistant), http.MethodPost, improvePath, draftBody, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"content":"# Hola\n\nBorrador mejorado."}`, response.Body.String())
	assert.Equal(t, []domain.Draft{{Title: "Hola", Content: "# Hola\n\nBorrador."}}, assistant.drafts)
}

func TestSuggestMetadata(t *testing.T) {
	assistant := &fakeAssistant{metadata: domain.MetadataSuggestion{Title: "Hola", Excerpt: "Un saludo.", Tags: []string{"go"}}}

	response := send(assistantRouter(t, assistant), http.MethodPost, metadataPath, draftBody, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"title":"Hola","excerpt":"Un saludo.","tags":["go"]}`, response.Body.String())
}

func TestSuggestMetadataNeverReturnsNullTags(t *testing.T) {
	assistant := &fakeAssistant{metadata: domain.MetadataSuggestion{Title: "Hola", Excerpt: "Un saludo."}}

	response := send(assistantRouter(t, assistant), http.MethodPost, metadataPath, draftBody, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"title":"Hola","excerpt":"Un saludo.","tags":[]}`, response.Body.String())
}

func TestAssistantRequiresAnAdminSession(t *testing.T) {
	for _, path := range []string{improvePath, metadataPath} {
		for name, tt := range map[string]struct {
			headers map[string]string
			status  int
		}{
			"sin sesión":     {status: http.StatusUnauthorized},
			"no es admin":    {headers: withCookies(accessCookie(editorAccessToken)), status: http.StatusForbidden},
			"Origin ajeno":   {headers: withOrigin(adminSession(), "https://evil.example"), status: http.StatusForbidden},
			"sesión forjada": {headers: withCookies(accessCookie("forged")), status: http.StatusUnauthorized},
		} {
			t.Run(path+" "+name, func(t *testing.T) {
				assistant := &fakeAssistant{}

				response := send(assistantRouter(t, assistant), http.MethodPost, path, draftBody, tt.headers)

				requireProblem(t, response, tt.status)
				assert.Empty(t, assistant.drafts, "nada llega al proveedor")
			})
		}
	}
}

func TestAssistantRejectsInvalidDrafts(t *testing.T) {
	for name, body := range map[string]string{
		"sin contenido":     `{"title":"Hola","content":""}`,
		"sin title":         `{"content":"Texto"}`,
		"contenido largo":   fmt.Sprintf(`{"title":"","content":%q}`, strings.Repeat("a", 50001)),
		"título largo":      fmt.Sprintf(`{"title":%q,"content":"Texto"}`, strings.Repeat("a", 201)),
		"no es un borrador": `[]`,
	} {
		t.Run(name, func(t *testing.T) {
			assistant := &fakeAssistant{}

			response := send(assistantRouter(t, assistant), http.MethodPost, improvePath, body, adminSession())

			requireProblem(t, response, http.StatusBadRequest)
			assert.Empty(t, assistant.drafts)
		})
	}
}

// Un campo que no es del borrador se ignora: al proveedor solo llegan el título
// y el contenido (ADR-021, punto 9).
func TestAssistantSendsOnlyTitleAndContent(t *testing.T) {
	assistant := &fakeAssistant{improved: "ok"}
	body := `{"title":"Hola","content":"Texto","userId":"u1","email":"leon@huitzi.xyz"}`

	response := send(assistantRouter(t, assistant), http.MethodPost, improvePath, body, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, []domain.Draft{{Title: "Hola", Content: "Texto"}}, assistant.drafts)
}

func TestAssistantAcceptsTheLongestDraft(t *testing.T) {
	assistant := &fakeAssistant{improved: "ok"}
	body := fmt.Sprintf(`{"title":%q,"content":%q}`, strings.Repeat("á", 200), strings.Repeat("é", 50000))

	response := send(assistantRouter(t, assistant), http.MethodPost, improvePath, body, adminSession())

	require.Equal(t, http.StatusOK, response.Code)
}

// Desactivado, sin proveedor o con una salida inválida: 503 con un detalle que
// dice cuál (ADR-021, puntos 7 y 8).
func TestAssistantErrorsAre503(t *testing.T) {
	for name, tt := range map[string]struct {
		err    error
		detail string
	}{
		"desactivado":     {err: domain.ErrAssistantDisabled, detail: "writing assistant is disabled"},
		"sin cuota":       {err: fmt.Errorf("%w: gemini responded 429 RESOURCE_EXHAUSTED", domain.ErrAssistantUnavailable), detail: "writing assistant is unavailable, try again later"},
		"timeout":         {err: errors.Join(domain.ErrAssistantUnavailable, context.DeadlineExceeded), detail: "writing assistant is unavailable, try again later"},
		"salida inválida": {err: fmt.Errorf("%w: title too long", domain.ErrAssistantInvalidOutput), detail: "writing assistant returned an invalid suggestion, try again"},
	} {
		for _, path := range []string{improvePath, metadataPath} {
			t.Run(name+" "+path, func(t *testing.T) {
				response := send(assistantRouter(t, &fakeAssistant{err: tt.err}), http.MethodPost, path, draftBody, adminSession())

				problem := requireProblem(t, response, http.StatusServiceUnavailable)
				require.NotNil(t, problem.Detail)
				assert.Equal(t, tt.detail, *problem.Detail)
				assert.NotContains(t, response.Body.String(), "RESOURCE_EXHAUSTED", "el detalle del proveedor no sale")
			})
		}
	}
}

// El asistente tiene su bucket por usuario, además del general (ADR-021,
// punto 7): agotarlo no afecta al resto de la API.
func TestAssistantHasItsOwnUserBucket(t *testing.T) {
	cfg := testRouterConfig()
	cfg.Assistant = &fakeAssistant{improved: "ok", metadata: domain.MetadataSuggestion{Title: "T", Excerpt: "E"}}
	cfg.RateLimits.Assistant = RateLimit{PerMinute: 2, Burst: 2}
	router := newTestRouterWith(t, cfg)

	assert.Equal(t, http.StatusOK, send(router, http.MethodPost, improvePath, draftBody, adminSession()).Code)
	assert.Equal(t, http.StatusOK, send(router, http.MethodPost, metadataPath, draftBody, adminSession()).Code)

	limited := send(router, http.MethodPost, improvePath, draftBody, adminSession())
	requireProblem(t, limited, http.StatusTooManyRequests)
	assert.NotEmpty(t, limited.Header().Get("Retry-After"))

	assert.Equal(t, http.StatusOK, send(router, http.MethodGet, "/api/v1/admin/posts", "", adminSession()).Code)
}

func TestNewRouterRequiresAnAssistant(t *testing.T) {
	cfg := testRouterConfig()
	cfg.Assistant = nil

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.Error(t, err)
}

// Con un servidor real: el WriteTimeout general cortaría una respuesta del
// asistente que tarda más que él; las rutas del asistente lo alargan.
func TestAssistantOutlivesTheServerWriteTimeout(t *testing.T) {
	cfg := testRouterConfig()
	cfg.Assistant = &fakeAssistant{improved: "ok", wait: 300 * time.Millisecond}
	cfg.AssistantTimeout = time.Second
	router := newTestRouterWith(t, cfg)

	server := httptest.NewUnstartedServer(router)
	server.Config.WriteTimeout = 100 * time.Millisecond
	server.Start()
	t.Cleanup(server.Close)

	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, server.URL+improvePath, strings.NewReader(draftBody))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	for name, value := range adminSession() {
		request.Header.Set(name, value)
	}

	response, err := server.Client().Do(request)
	require.NoError(t, err, "sin alargar el deadline, el servidor cierra la conexión")
	defer func() { _ = response.Body.Close() }()

	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	assert.JSONEq(t, `{"content":"ok"}`, string(body))
}

func withOrigin(headers map[string]string, origin string) map[string]string {
	headers["Origin"] = origin

	return headers
}
