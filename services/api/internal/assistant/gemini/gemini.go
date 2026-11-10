// Package gemini implementa domain.WritingAssistant con la API de Gemini y el
// SDK oficial google.golang.org/genai (ADR-021).
package gemini

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"google.golang.org/genai"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// Config configura el adaptador. BaseURL y HTTPClient solo se usan en los
// tests, para apuntar a un servidor local con respuestas grabadas.
type Config struct {
	APIKey     string
	Model      string
	BaseURL    string
	HTTPClient *http.Client
}

// Assistant llama a Gemini: una petición por operación, sin herramientas y sin
// reintentos.
type Assistant struct {
	models *genai.Models
	model  string
}

var _ domain.WritingAssistant = (*Assistant)(nil)

// New crea el cliente. No hace ninguna llamada a la red.
func New(ctx context.Context, cfg Config) (*Assistant, error) {
	if cfg.APIKey == "" || cfg.Model == "" {
		return nil, errors.New("gemini: api key and model are required")
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{}
	}

	noRetries := int32(1)
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: cfg.APIKey,
		// Explícito: sin Backend, el SDK elige Vertex AI si el entorno tiene
		// GOOGLE_GENAI_USE_VERTEXAI.
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: httpClient,
		HTTPOptions: genai.HTTPOptions{
			BaseURL: cfg.BaseURL,
			// Sin reintentos (ADR-021). Hoy es el valor por defecto con
			// RetryOptions nil; explícito, no depende de que siga así.
			RetryOptions: &genai.HTTPRetryOptions{Attempts: &noRetries},
		},
	})
	if err != nil {
		// Algunos errores de NewClient imprimen la configuración con %#v,
		// API key incluida.
		return nil, fmt.Errorf("gemini: create client: %s", redact(err.Error(), cfg.APIKey))
	}

	return &Assistant{models: client.Models, model: cfg.Model}, nil
}

// ImproveWriting pide el contenido reescrito.
func (a *Assistant) ImproveWriting(ctx context.Context, draft domain.Draft) (domain.ImprovedWriting, error) {
	var output struct {
		Content string `json:"content"`
	}

	usage, err := a.generate(ctx, improveInstruction, improveSchema, draft, &output)
	if err != nil {
		return domain.ImprovedWriting{Usage: usage}, err
	}

	return domain.ImprovedWriting{Content: output.Content, Usage: usage}, nil
}

// SuggestMetadata pide título, extracto y etiquetas. El service los valida.
func (a *Assistant) SuggestMetadata(ctx context.Context, draft domain.Draft) (domain.MetadataSuggestion, error) {
	var output struct {
		Title   string   `json:"title"`
		Excerpt string   `json:"excerpt"`
		Tags    []string `json:"tags"`
	}

	usage, err := a.generate(ctx, metadataInstruction, metadataSchema, draft, &output)
	if err != nil {
		return domain.MetadataSuggestion{Usage: usage}, err
	}

	return domain.MetadataSuggestion{Title: output.Title, Excerpt: output.Excerpt, Tags: output.Tags, Usage: usage}, nil
}

// draftData es el borrador como lo ve el modelo: un objeto JSON en el mensaje
// del usuario, separado de las instrucciones del sistema. Codificado como
// JSON, ningún texto del borrador puede cerrar el delimitador y hacerse pasar
// por instrucciones.
type draftData struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// generate hace la llamada y decodifica la salida estructurada en output. Los
// errores nunca llevan el texto del SDK: algunos incluyen el cuerpo de la
// respuesta, es decir, la salida del modelo.
func (a *Assistant) generate(ctx context.Context, instruction string, schema map[string]any, draft domain.Draft, output any) (domain.AssistantUsage, error) {
	usage := domain.AssistantUsage{Model: a.model}

	data, err := json.Marshal(draftData(draft))
	if err != nil {
		return usage, fmt.Errorf("gemini: encode draft: %w", err)
	}

	response, err := a.models.GenerateContent(ctx, a.model, []*genai.Content{
		genai.NewContentFromText(string(data), genai.RoleUser),
	}, &genai.GenerateContentConfig{
		SystemInstruction:  genai.NewContentFromText(instruction, genai.RoleUser),
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: schema,
	})
	if err != nil {
		return usage, providerError(ctx, err)
	}

	usage = usageOf(response, a.model)

	if response.PromptFeedback != nil && response.PromptFeedback.BlockReason != "" {
		return usage, fmt.Errorf("%w: prompt blocked: %s", domain.ErrAssistantInvalidOutput, response.PromptFeedback.BlockReason)
	}

	if len(response.Candidates) == 0 {
		return usage, fmt.Errorf("%w: no candidates", domain.ErrAssistantInvalidOutput)
	}

	// Una salida cortada (MAX_TOKENS) o filtrada (SAFETY) no es JSON completo
	// o no es la respuesta pedida.
	if reason := response.Candidates[0].FinishReason; reason != genai.FinishReasonStop {
		return usage, fmt.Errorf("%w: finish reason %s", domain.ErrAssistantInvalidOutput, reason)
	}

	if err := json.Unmarshal([]byte(response.Text()), output); err != nil {
		return usage, fmt.Errorf("%w: output is not the requested JSON", domain.ErrAssistantInvalidOutput)
	}

	return usage, nil
}

// providerError clasifica un error del SDK sin copiar su texto.
func providerError(ctx context.Context, err error) error {
	var apiErr genai.APIError
	switch {
	case ctx.Err() != nil:
		return fmt.Errorf("%w: %w", domain.ErrAssistantUnavailable, ctx.Err())
	case errors.As(err, &apiErr):
		// Code y Status (por ejemplo 429 RESOURCE_EXHAUSTED al agotar la
		// cuota) no llevan datos del borrador; Message y Details podrían.
		return fmt.Errorf("%w: gemini responded %d %s", domain.ErrAssistantUnavailable, apiErr.Code, apiErr.Status)
	default:
		return fmt.Errorf("%w: request to gemini failed", domain.ErrAssistantUnavailable)
	}
}

func usageOf(response *genai.GenerateContentResponse, model string) domain.AssistantUsage {
	usage := domain.AssistantUsage{Model: model}
	if response.ModelVersion != "" {
		usage.Model = response.ModelVersion
	}

	if metadata := response.UsageMetadata; metadata != nil {
		usage.InputTokens = int(metadata.PromptTokenCount)
		// Los tokens de razonamiento también cuentan para la cuota.
		usage.OutputTokens = int(metadata.CandidatesTokenCount + metadata.ThoughtsTokenCount)
	}

	return usage
}

func redact(text, secret string) string {
	if secret == "" {
		return text
	}

	return strings.ReplaceAll(text, secret, "[REDACTED]")
}
