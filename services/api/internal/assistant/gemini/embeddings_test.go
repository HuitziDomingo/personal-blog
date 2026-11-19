package gemini

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// embedRequest es el cuerpo de batchEmbedContents.
type embedRequest struct {
	Requests []struct {
		Model   string `json:"model"`
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
		TaskType             string `json:"taskType"`
		OutputDimensionality int    `json:"outputDimensionality"`
	} `json:"requests"`
}

// fakeEmbeddings responde un vector por texto, con dims dimensiones. El
// primer valor del vector es la posición del texto en la petición, para
// comprobar el orden.
type fakeEmbeddings struct {
	server   *httptest.Server
	requests []embedRequest
	paths    []string
	hits     atomic.Int32
	dims     int
	status   int
}

func newFakeEmbeddings(t *testing.T, dims, status int) *fakeEmbeddings {
	t.Helper()

	fake := &fakeEmbeddings{dims: dims, status: status}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fake.hits.Add(1)
		raw, _ := io.ReadAll(r.Body)

		var request embedRequest
		_ = json.Unmarshal(raw, &request)
		fake.requests = append(fake.requests, request)
		fake.paths = append(fake.paths, r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		if fake.status != http.StatusOK {
			w.WriteHeader(fake.status)
			_, _ = w.Write([]byte(`{"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota: title: secreto"}}`))

			return
		}

		embeddings := make([]map[string]any, len(request.Requests))
		for i := range request.Requests {
			values := make([]float32, fake.dims)
			values[0] = float32(i)
			embeddings[i] = map[string]any{"values": values}
		}

		_ = json.NewEncoder(w).Encode(map[string]any{"embeddings": embeddings})
	}))
	t.Cleanup(fake.server.Close)

	return fake
}

func newTestEmbedder(t *testing.T, fake *fakeEmbeddings, model string) *Embedder {
	t.Helper()

	embedder, err := NewEmbedder(t.Context(), EmbedderConfig{
		APIKey:     testKey,
		Model:      model,
		BaseURL:    fake.server.URL + "/",
		HTTPClient: fake.server.Client(),
	})
	require.NoError(t, err)

	return embedder
}

func TestNewEmbedderRequiresKeyAndModel(t *testing.T) {
	_, err := NewEmbedder(t.Context(), EmbedderConfig{Model: "gemini-embedding-2"})
	require.Error(t, err)

	_, err = NewEmbedder(t.Context(), EmbedderConfig{APIKey: testKey})
	require.Error(t, err)
}

// gemini-embedding-2 recibe la tarea como prefijo del texto: el documento con
// su título y la consulta con «task: search result».
func TestEmbedDocumentsAndQueryUseTaskPrefixes(t *testing.T) {
	fake := newFakeEmbeddings(t, domain.EmbeddingDimensions, http.StatusOK)
	embedder := newTestEmbedder(t, fake, "gemini-embedding-2")

	vectors, err := embedder.EmbedDocuments(t.Context(), []domain.EmbeddingDocument{
		{Title: "Post — Sección", Text: "uno"},
		{Title: "", Text: "dos"},
	})
	require.NoError(t, err)
	require.Len(t, vectors, 2)
	assert.InDelta(t, 1, vectors[1][0], 0, "mismo orden que los documentos")

	query, err := embedder.EmbedQuery(t.Context(), "¿cómo orquesto agentes?")
	require.NoError(t, err)
	assert.Len(t, query, domain.EmbeddingDimensions)

	require.Len(t, fake.requests, 2)
	documents := fake.requests[0].Requests
	assert.Equal(t, "title: Post — Sección | text: uno", documents[0].Content.Parts[0].Text)
	assert.Equal(t, "title: none | text: dos", documents[1].Content.Parts[0].Text)
	assert.Empty(t, documents[0].TaskType)
	assert.Equal(t, domain.EmbeddingDimensions, documents[0].OutputDimensionality)
	assert.Equal(t, "task: search result | query: ¿cómo orquesto agentes?", fake.requests[1].Requests[0].Content.Parts[0].Text)
	assert.Equal(t, "/v1beta/models/gemini-embedding-2:batchEmbedContents", fake.paths[0])
}

// gemini-embedding-001 no entiende los prefijos: la tarea va en taskType.
func TestLegacyEmbeddingModelUsesTaskType(t *testing.T) {
	fake := newFakeEmbeddings(t, domain.EmbeddingDimensions, http.StatusOK)
	embedder := newTestEmbedder(t, fake, "gemini-embedding-001")

	_, err := embedder.EmbedDocuments(t.Context(), []domain.EmbeddingDocument{{Title: "T", Text: "uno"}})
	require.NoError(t, err)
	_, err = embedder.EmbedQuery(t.Context(), "consulta")
	require.NoError(t, err)

	assert.Equal(t, "uno", fake.requests[0].Requests[0].Content.Parts[0].Text)
	assert.Equal(t, "RETRIEVAL_DOCUMENT", fake.requests[0].Requests[0].TaskType)
	assert.Equal(t, "consulta", fake.requests[1].Requests[0].Content.Parts[0].Text)
	assert.Equal(t, "RETRIEVAL_QUERY", fake.requests[1].Requests[0].TaskType)
}

func TestEmbedDocumentsSplitsBatchesOf100(t *testing.T) {
	fake := newFakeEmbeddings(t, domain.EmbeddingDimensions, http.StatusOK)
	documents := make([]domain.EmbeddingDocument, 250)
	for i := range documents {
		documents[i] = domain.EmbeddingDocument{Text: strings.Repeat("x", i+1)}
	}

	vectors, err := newTestEmbedder(t, fake, "gemini-embedding-2").EmbedDocuments(t.Context(), documents)

	require.NoError(t, err)
	assert.Len(t, vectors, 250)
	assert.EqualValues(t, 3, fake.hits.Load())
	assert.Len(t, fake.requests[2].Requests, 50)
}

func TestEmbedRejectsWrongDimensions(t *testing.T) {
	fake := newFakeEmbeddings(t, 3072, http.StatusOK)

	_, err := newTestEmbedder(t, fake, "gemini-embedding-2").EmbedQuery(t.Context(), "consulta")

	require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
}

func TestEmbedQuotaExhaustedHidesTheResponse(t *testing.T) {
	fake := newFakeEmbeddings(t, domain.EmbeddingDimensions, http.StatusTooManyRequests)

	_, err := newTestEmbedder(t, fake, "gemini-embedding-2").EmbedDocuments(t.Context(), []domain.EmbeddingDocument{{Title: "secreto", Text: "texto"}})

	require.ErrorIs(t, err, domain.ErrAssistantUnavailable)
	assert.Contains(t, err.Error(), "429")
	assert.NotContains(t, err.Error(), "secreto")
	assert.NotContains(t, err.Error(), testKey)
}
