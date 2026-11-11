package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// Límites de los metadatos de un post; coinciden con PostWrite en el contrato
// (docs/api/openapi.yaml). Para un post los aplica el validador del contrato;
// para una sugerencia del asistente, que no pasa por él, los aplica este
// service.
const (
	MaxTitleLength   = 200
	MaxExcerptLength = 500
	MaxTags          = 20
	MaxTagLength     = 50
	// MaxAssistantContentLength es el límite del contenido de un borrador que
	// acepta el asistente (AssistantDraft en el contrato). PostWrite no tiene
	// un límite propio para el contenido, más allá del tamaño del cuerpo; este
	// es el que aplica a lo que devuelve ImproveWriting, para que el resultado
	// pueda volver a enviarse al asistente.
	MaxAssistantContentLength = 50000
)

// Resultados de una llamada al proveedor, para el log.
const (
	assistantResultOK            = "ok"
	assistantResultTimeout       = "timeout"
	assistantResultUnavailable   = "unavailable"
	assistantResultInvalidOutput = "invalid_output"
)

// AssistantService aplica las reglas del asistente de escritura (ADR-021) sobre
// un proveedor: timeout por llamada, validación de la salida y un log por
// llamada con modelo, latencia, tokens y resultado, nunca con el contenido.
type AssistantService struct {
	provider domain.WritingAssistant
	timeout  time.Duration
	logger   *slog.Logger
	now      func() time.Time
}

// NewAssistantService crea el service sobre un proveedor. Un timeout de cero
// o menos es un error: la llamada quedaría sin límite.
func NewAssistantService(provider domain.WritingAssistant, timeout time.Duration, logger *slog.Logger, now func() time.Time) (*AssistantService, error) {
	if provider == nil {
		return nil, errors.New("assistant service needs a provider")
	}

	if timeout <= 0 {
		return nil, fmt.Errorf("assistant timeout must be positive: %s", timeout)
	}

	return &AssistantService{provider: provider, timeout: timeout, logger: logger, now: now}, nil
}

// NewDisabledAssistant es el asistente con ASSISTANT_ENABLED=false: toda
// operación devuelve domain.ErrAssistantDisabled y nada llega a un proveedor.
func NewDisabledAssistant() *AssistantService {
	return &AssistantService{}
}

// ImproveWriting devuelve el contenido reescrito. Comprueba que no venga vacío
// ni pase de MaxAssistantContentLength; el Markdown es texto no confiable que
// se sanitiza al renderizar.
func (s *AssistantService) ImproveWriting(ctx context.Context, draft domain.Draft) (string, error) {
	if s.provider == nil {
		return "", domain.ErrAssistantDisabled
	}

	result, err := call(ctx, s, "improve_writing", draft, s.provider.ImproveWriting,
		func(r domain.ImprovedWriting) domain.AssistantUsage { return r.Usage },
		func(r domain.ImprovedWriting) error {
			if strings.TrimSpace(r.Content) == "" {
				return fmt.Errorf("%w: empty content", domain.ErrAssistantInvalidOutput)
			}

			if utf8.RuneCountInString(r.Content) > MaxAssistantContentLength {
				return fmt.Errorf("%w: content too long", domain.ErrAssistantInvalidOutput)
			}

			return nil
		})
	if err != nil {
		return "", err
	}

	return result.Content, nil
}

// SuggestMetadata devuelve título, extracto y etiquetas que cumplen las mismas
// reglas que un post. Si no las cumplen, falla: no recorta ni corrige lo que
// sugirió el modelo.
func (s *AssistantService) SuggestMetadata(ctx context.Context, draft domain.Draft) (domain.MetadataSuggestion, error) {
	if s.provider == nil {
		return domain.MetadataSuggestion{}, domain.ErrAssistantDisabled
	}

	result, err := call(ctx, s, "suggest_metadata", draft, s.provider.SuggestMetadata,
		func(r domain.MetadataSuggestion) domain.AssistantUsage { return r.Usage },
		func(r domain.MetadataSuggestion) error { return validateMetadata(normalizeMetadata(r)) })
	if err != nil {
		return domain.MetadataSuggestion{}, err
	}

	return normalizeMetadata(result), nil
}

// call hace una llamada al proveedor con timeout, valida el resultado y deja un
// log. Es genérica en el tipo del resultado para que las dos operaciones
// compartan el timeout y el log.
func call[T any](
	ctx context.Context,
	s *AssistantService,
	operation string,
	draft domain.Draft,
	do func(context.Context, domain.Draft) (T, error),
	usageOf func(T) domain.AssistantUsage,
	validate func(T) error,
) (T, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	start := s.now()
	result, err := do(ctx, draft)
	if err == nil {
		err = validate(result)
	}

	usage := usageOf(result)
	attrs := []any{
		"operation", operation,
		"model", usage.Model,
		"latency_ms", s.now().Sub(start).Milliseconds(),
		"input_tokens", usage.InputTokens,
		"output_tokens", usage.OutputTokens,
		"result", resultOf(err),
	}

	level := slog.LevelInfo
	if err != nil {
		level = slog.LevelWarn
		// La causa distingue un 503 o un 429 del proveedor de un timeout
		// propio o de una salida inválida. Los errores del proveedor nunca
		// llevan el borrador ni la salida del modelo (ver el adaptador).
		attrs = append(attrs, "reason", err.Error())
	}

	s.logger.Log(ctx, level, "writing assistant call", attrs...)

	if err != nil {
		return result, fmt.Errorf("writing assistant %s: %w", operation, err)
	}

	return result, nil
}

func resultOf(err error) string {
	switch {
	case err == nil:
		return assistantResultOK
	case errors.Is(err, context.DeadlineExceeded):
		return assistantResultTimeout
	case errors.Is(err, domain.ErrAssistantInvalidOutput):
		return assistantResultInvalidOutput
	default:
		return assistantResultUnavailable
	}
}

// normalizeMetadata aplica lo mismo que se aplica al guardar un post: título y
// extracto sin espacios en los extremos, y etiquetas normalizadas.
func normalizeMetadata(suggestion domain.MetadataSuggestion) domain.MetadataSuggestion {
	suggestion.Title = strings.TrimSpace(suggestion.Title)
	suggestion.Excerpt = strings.TrimSpace(suggestion.Excerpt)
	suggestion.Tags = normalizeTags(suggestion.Tags)

	return suggestion
}

// validateMetadata aplica los límites de PostWrite. Además exige extracto, que
// en un post es opcional, porque se pidió uno.
func validateMetadata(suggestion domain.MetadataSuggestion) error {
	invalid := func(reason string) error {
		return fmt.Errorf("%w: %s", domain.ErrAssistantInvalidOutput, reason)
	}

	switch {
	case suggestion.Title == "":
		return invalid("empty title")
	case utf8.RuneCountInString(suggestion.Title) > MaxTitleLength:
		return invalid("title too long")
	case suggestion.Excerpt == "":
		return invalid("empty excerpt")
	case utf8.RuneCountInString(suggestion.Excerpt) > MaxExcerptLength:
		return invalid("excerpt too long")
	case len(suggestion.Tags) > MaxTags:
		return invalid("too many tags")
	}

	for _, tag := range suggestion.Tags {
		if utf8.RuneCountInString(tag) > MaxTagLength {
			return invalid("tag too long")
		}
	}

	return nil
}
