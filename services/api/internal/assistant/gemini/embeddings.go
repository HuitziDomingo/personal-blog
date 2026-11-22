package gemini

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"google.golang.org/genai"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// legacyEmbeddingModel no entiende los prefijos de tarea en el texto: usa
	// el campo taskType de la petición.
	legacyEmbeddingModel = "gemini-embedding-001"

	// maxEmbeddingBatch es cuántos textos acepta batchEmbedContents por
	// petición.
	maxEmbeddingBatch = 100

	// Tipos de tarea de gemini-embedding-001 para búsqueda asimétrica.
	taskRetrievalDocument = "RETRIEVAL_DOCUMENT"
	taskRetrievalQuery    = "RETRIEVAL_QUERY"
)

// EmbedderConfig configura el adaptador de embeddings. BaseURL y HTTPClient
// solo se usan en los tests.
type EmbedderConfig struct {
	APIKey     string
	Model      string
	BaseURL    string
	HTTPClient *http.Client
}

// Embedder implementa domain.Embedder con los embeddings de Gemini (ADR-027,
// punto 2): vectores de domain.EmbeddingDimensions, sin reintentos.
type Embedder struct {
	models *genai.Models
	model  string
}

var _ domain.Embedder = (*Embedder)(nil)

// NewEmbedder crea el cliente. No hace ninguna llamada a la red.
func NewEmbedder(ctx context.Context, cfg EmbedderConfig) (*Embedder, error) {
	if cfg.APIKey == "" || cfg.Model == "" {
		return nil, errors.New("gemini embedder: api key and model are required")
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{}
	}

	noRetries := int32(1)
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:     cfg.APIKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: httpClient,
		HTTPOptions: genai.HTTPOptions{
			BaseURL:      cfg.BaseURL,
			RetryOptions: &genai.HTTPRetryOptions{Attempts: &noRetries},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("gemini embedder: create client: %s", redact(err.Error(), cfg.APIKey))
	}

	return &Embedder{models: client.Models, model: cfg.Model}, nil
}

// Model devuelve el modelo configurado.
func (e *Embedder) Model() string {
	return e.model
}

// EmbedDocuments genera los embeddings de documento, en lotes de
// maxEmbeddingBatch.
func (e *Embedder) EmbedDocuments(ctx context.Context, documents []domain.EmbeddingDocument) ([][]float32, error) {
	texts := make([]string, len(documents))
	for i, document := range documents {
		texts[i] = e.documentText(document)
	}

	vectors := make([][]float32, 0, len(texts))
	for start := 0; start < len(texts); start += maxEmbeddingBatch {
		end := min(start+maxEmbeddingBatch, len(texts))

		batch, err := e.embed(ctx, texts[start:end], taskRetrievalDocument)
		if err != nil {
			return nil, err
		}

		vectors = append(vectors, batch...)
	}

	return vectors, nil
}

// EmbedQuery genera el embedding de una consulta.
func (e *Embedder) EmbedQuery(ctx context.Context, text string) ([]float32, error) {
	vectors, err := e.embed(ctx, []string{e.queryText(text)}, taskRetrievalQuery)
	if err != nil {
		return nil, err
	}

	return vectors[0], nil
}

// documentText y queryText aplican el formato de tarea de gemini-embedding-2
// para búsqueda asimétrica: la consulta lleva el prefijo de la tarea y el
// documento su título. gemini-embedding-001 recibe el texto tal cual y la
// tarea en taskType.
func (e *Embedder) documentText(document domain.EmbeddingDocument) string {
	if e.model == legacyEmbeddingModel {
		return document.Text
	}

	title := document.Title
	if title == "" {
		title = "none"
	}

	return "title: " + title + " | text: " + document.Text
}

func (e *Embedder) queryText(text string) string {
	if e.model == legacyEmbeddingModel {
		return text
	}

	return "task: search result | query: " + text
}

// embed hace una petición y comprueba que devuelva un vector de
// domain.EmbeddingDimensions por texto. Como en generate, los errores no
// copian el texto del SDK.
func (e *Embedder) embed(ctx context.Context, texts []string, task string) ([][]float32, error) {
	contents := make([]*genai.Content, len(texts))
	for i, text := range texts {
		contents[i] = genai.NewContentFromText(text, genai.RoleUser)
	}

	dimensions := int32(domain.EmbeddingDimensions)
	config := &genai.EmbedContentConfig{OutputDimensionality: &dimensions}
	if e.model == legacyEmbeddingModel {
		config.TaskType = task
	}

	response, err := e.models.EmbedContent(ctx, e.model, contents, config)
	if err != nil {
		return nil, providerError(ctx, err)
	}

	if len(response.Embeddings) != len(texts) {
		return nil, fmt.Errorf("%w: got %d embeddings for %d texts", domain.ErrAssistantInvalidOutput, len(response.Embeddings), len(texts))
	}

	vectors := make([][]float32, len(texts))
	for i, embedding := range response.Embeddings {
		if embedding == nil || len(embedding.Values) != domain.EmbeddingDimensions {
			return nil, fmt.Errorf("%w: embedding %d does not have %d dimensions", domain.ErrAssistantInvalidOutput, i, domain.EmbeddingDimensions)
		}

		vectors[i] = embedding.Values
	}

	return vectors, nil
}
