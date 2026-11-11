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

// MaxModerationReasonLength es el límite del motivo que guarda el análisis. El
// prompt pide una frase; un motivo más largo se considera salida inválida.
const MaxModerationReasonLength = 300

// ModerationService aplica las reglas de la moderación con LLM (ADR-022,
// puntos 4 y 5) sobre un clasificador: timeout por llamada, sin reintentos,
// validación de la salida, revisión humana obligatoria para prompt_injection y
// personal_data, y un log por llamada sin el texto del comentario.
type ModerationService struct {
	provider domain.CommentModerator
	timeout  time.Duration
	logger   *slog.Logger
	now      func() time.Time
}

// NewModerationService crea el service sobre un clasificador. Un timeout de
// cero o menos es un error: la llamada quedaría sin límite.
func NewModerationService(provider domain.CommentModerator, timeout time.Duration, logger *slog.Logger, now func() time.Time) (*ModerationService, error) {
	if provider == nil {
		return nil, errors.New("moderation service needs a provider")
	}

	if timeout <= 0 {
		return nil, fmt.Errorf("moderation timeout must be positive: %s", timeout)
	}

	return &ModerationService{provider: provider, timeout: timeout, logger: logger, now: now}, nil
}

// Analyze clasifica el comentario y devuelve el análisis listo para guardar.
// Un service nil es la moderación apagada: devuelve domain.ErrModerationDisabled.
// Cualquier fallo del clasificador, timeout incluido, es
// domain.ErrModerationUnavailable.
func (s *ModerationService) Analyze(ctx context.Context, comment domain.CommentForModeration) (*domain.Moderation, error) {
	if s == nil {
		return nil, domain.ErrModerationDisabled
	}

	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	start := s.now()
	result, err := s.provider.Classify(ctx, comment)
	if err == nil {
		err = validateModeration(&result)
	}

	attrs := []any{
		"operation", "classify_comment",
		"model", result.Usage.Model,
		"latency_ms", s.now().Sub(start).Milliseconds(),
		"input_tokens", result.Usage.InputTokens,
		"output_tokens", result.Usage.OutputTokens,
		"result", resultOf(err),
	}

	level := slog.LevelInfo
	if err != nil {
		level = slog.LevelWarn
		// Los errores del adaptador nunca llevan el comentario ni la salida
		// del modelo; el motivo validado tampoco se registra.
		attrs = append(attrs, "reason", err.Error())
	} else {
		attrs = append(attrs, "verdict", string(result.Verdict), "category", string(result.Category))
	}

	s.logger.Log(ctx, level, "comment moderation call", attrs...)

	if err != nil {
		return nil, fmt.Errorf("%w: %w", domain.ErrModerationUnavailable, err)
	}

	verdict := result.Verdict
	if result.Category.NeedsHumanReview() {
		verdict = domain.ModerationVerdictReview
	}

	return &domain.Moderation{
		Verdict:    verdict,
		Category:   result.Category,
		Reason:     result.Reason,
		Model:      result.Usage.Model,
		AnalyzedAt: s.now().UTC().Truncate(time.Millisecond),
	}, nil
}

// validateModeration comprueba que la salida esté dentro de los enums y que el
// motivo sea una frase corta. Recorta los espacios del motivo.
func validateModeration(result *domain.ModerationResult) error {
	result.Reason = strings.TrimSpace(result.Reason)

	switch {
	case !result.Verdict.IsValid():
		return fmt.Errorf("%w: unknown verdict", domain.ErrAssistantInvalidOutput)
	case !result.Category.IsValid():
		return fmt.Errorf("%w: unknown category", domain.ErrAssistantInvalidOutput)
	case result.Reason == "":
		return fmt.Errorf("%w: empty reason", domain.ErrAssistantInvalidOutput)
	case utf8.RuneCountInString(result.Reason) > MaxModerationReasonLength:
		return fmt.Errorf("%w: reason too long", domain.ErrAssistantInvalidOutput)
	}

	return nil
}
