package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// fakeModerator es un clasificador escrito a mano (ADR-015). Devuelve result o
// err, registra lo que recibe y, con block, espera a que venza el contexto.
type fakeModerator struct {
	mu       sync.Mutex
	result   domain.ModerationResult
	err      error
	block    bool
	received []domain.CommentForModeration
}

func (f *fakeModerator) Classify(ctx context.Context, comment domain.CommentForModeration) (domain.ModerationResult, error) {
	f.mu.Lock()
	f.received = append(f.received, comment)
	result, err, block := f.result, f.err, f.block
	f.mu.Unlock()

	if block {
		<-ctx.Done()

		return domain.ModerationResult{Usage: domain.AssistantUsage{Model: "fake"}}, fmt.Errorf("%w: %w", domain.ErrAssistantUnavailable, ctx.Err())
	}

	return result, err
}

func (f *fakeModerator) calls() []domain.CommentForModeration {
	f.mu.Lock()
	defer f.mu.Unlock()

	return append([]domain.CommentForModeration(nil), f.received...)
}

func approveResult() domain.ModerationResult {
	return domain.ModerationResult{
		Verdict:  domain.ModerationVerdictApprove,
		Category: domain.ModerationCategoryNone,
		Reason:   "  Pregunta sobre el artículo.  ",
		Usage:    domain.AssistantUsage{Model: "gemini-test-001", InputTokens: 90, OutputTokens: 20},
	}
}

func newTestModeration(t *testing.T, provider domain.CommentModerator, timeout time.Duration) (*ModerationService, *bytes.Buffer) {
	t.Helper()

	logs := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logs, nil))
	moderation, err := NewModerationService(provider, timeout, logger, func() time.Time { return commentNow })
	require.NoError(t, err)

	return moderation, logs
}

func TestNewModerationServiceNeedsProviderAndTimeout(t *testing.T) {
	_, err := NewModerationService(nil, time.Second, slog.Default(), time.Now)
	require.Error(t, err)

	_, err = NewModerationService(&fakeModerator{}, 0, slog.Default(), time.Now)
	require.Error(t, err)
}

func TestAnalyzeReturnsTheValidatedModeration(t *testing.T) {
	provider := &fakeModerator{result: approveResult()}
	moderation, logs := newTestModeration(t, provider, time.Second)

	got, err := moderation.Analyze(t.Context(), domain.CommentForModeration{PostTitle: "Arrays", Name: "Ana", Content: "secreto-del-comentario"})

	require.NoError(t, err)
	assert.Equal(t, &domain.Moderation{
		Verdict:    domain.ModerationVerdictApprove,
		Category:   domain.ModerationCategoryNone,
		Reason:     "Pregunta sobre el artículo.",
		Model:      "gemini-test-001",
		AnalyzedAt: commentNow.Truncate(time.Millisecond),
	}, got)
	assert.Equal(t, []domain.CommentForModeration{{PostTitle: "Arrays", Name: "Ana", Content: "secreto-del-comentario"}}, provider.calls())

	assert.Contains(t, logs.String(), "result=ok")
	assert.Contains(t, logs.String(), "verdict=approve")
	assert.NotContains(t, logs.String(), "secreto-del-comentario", "el log nunca lleva el comentario")
	assert.NotContains(t, logs.String(), "Pregunta sobre", "ni el motivo del modelo")
}

// prompt_injection y personal_data van siempre a revisión humana, aunque el
// modelo sugiera aprobar o rechazar (ADR-022, punto 5).
func TestSensitiveCategoriesAlwaysNeedHumanReview(t *testing.T) {
	for _, category := range []domain.ModerationCategory{domain.ModerationCategoryPromptInjection, domain.ModerationCategoryPersonalData} {
		for _, verdict := range []domain.ModerationVerdict{domain.ModerationVerdictApprove, domain.ModerationVerdictReject, domain.ModerationVerdictReview} {
			t.Run(string(category)+"/"+string(verdict), func(t *testing.T) {
				result := approveResult()
				result.Category, result.Verdict = category, verdict
				moderation, _ := newTestModeration(t, &fakeModerator{result: result}, time.Second)

				got, err := moderation.Analyze(t.Context(), domain.CommentForModeration{Name: "x", Content: "y"})

				require.NoError(t, err)
				assert.Equal(t, domain.ModerationVerdictReview, got.Verdict)
				assert.Equal(t, category, got.Category)
			})
		}
	}
}

func TestOtherCategoriesKeepTheModelVerdict(t *testing.T) {
	result := approveResult()
	result.Verdict, result.Category = domain.ModerationVerdictReject, domain.ModerationCategorySpam
	moderation, _ := newTestModeration(t, &fakeModerator{result: result}, time.Second)

	got, err := moderation.Analyze(t.Context(), domain.CommentForModeration{Name: "x", Content: "y"})

	require.NoError(t, err)
	assert.Equal(t, domain.ModerationVerdictReject, got.Verdict)
}

func TestInvalidModerationOutputIsUnavailable(t *testing.T) {
	for name, mutate := range map[string]func(*domain.ModerationResult){
		"veredicto desconocido": func(r *domain.ModerationResult) { r.Verdict = "publish" },
		"categoría desconocida": func(r *domain.ModerationResult) { r.Category = "toxic" },
		"motivo vacío":          func(r *domain.ModerationResult) { r.Reason = "  " },
		"motivo largo":          func(r *domain.ModerationResult) { r.Reason = strings.Repeat("á", MaxModerationReasonLength+1) },
	} {
		t.Run(name, func(t *testing.T) {
			result := approveResult()
			mutate(&result)
			moderation, logs := newTestModeration(t, &fakeModerator{result: result}, time.Second)

			_, err := moderation.Analyze(t.Context(), domain.CommentForModeration{Name: "x", Content: "y"})

			require.ErrorIs(t, err, domain.ErrModerationUnavailable)
			assert.Contains(t, logs.String(), "result=invalid_output")
		})
	}
}

func TestModerationProviderErrorIsUnavailable(t *testing.T) {
	provider := &fakeModerator{err: fmt.Errorf("%w: gemini responded 503 UNAVAILABLE", domain.ErrAssistantUnavailable)}
	moderation, logs := newTestModeration(t, provider, time.Second)

	_, err := moderation.Analyze(t.Context(), domain.CommentForModeration{Name: "x", Content: "y"})

	require.ErrorIs(t, err, domain.ErrModerationUnavailable)
	assert.Contains(t, logs.String(), "gemini responded 503 UNAVAILABLE")
}

func TestModerationTimeout(t *testing.T) {
	moderation, logs := newTestModeration(t, &fakeModerator{block: true}, 20*time.Millisecond)

	_, err := moderation.Analyze(t.Context(), domain.CommentForModeration{Name: "x", Content: "y"})

	require.ErrorIs(t, err, domain.ErrModerationUnavailable)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Contains(t, logs.String(), "result=timeout")
}

func TestNilModerationIsDisabled(t *testing.T) {
	var moderation *ModerationService

	_, err := moderation.Analyze(t.Context(), domain.CommentForModeration{})

	require.ErrorIs(t, err, domain.ErrModerationDisabled)
}

func TestSubmitWithModerationSavesTheAnalysis(t *testing.T) {
	provider := &fakeModerator{result: approveResult()}
	moderation, _ := newTestModeration(t, provider, time.Second)
	comments, repository := newModeratedCommentService(true, moderation)

	require.NoError(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: " Ana ", Content: " Hola "}))

	saved := repository.all()
	require.Len(t, saved, 1)
	assert.Equal(t, domain.CommentStatusPending, saved[0].Status, "el veredicto nunca publica: decide el autor")
	require.NotNil(t, saved[0].Moderation)
	assert.Equal(t, domain.ModerationVerdictApprove, saved[0].Moderation.Verdict)
	assert.Equal(t, []domain.CommentForModeration{{PostTitle: "Publicado", Name: "Ana", Content: "Hola"}}, provider.calls())
}

// Si el clasificador falla o se agota, el comentario se guarda igual, sin
// análisis (ADR-022, punto 4).
func TestSubmitSavesWithoutAnalysisWhenModerationFails(t *testing.T) {
	for name, provider := range map[string]*fakeModerator{
		"error":   {err: domain.ErrAssistantUnavailable},
		"timeout": {block: true},
	} {
		t.Run(name, func(t *testing.T) {
			moderation, _ := newTestModeration(t, provider, 20*time.Millisecond)
			comments, repository := newModeratedCommentService(true, moderation)

			require.NoError(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "Ana", Content: "Hola"}))

			saved := repository.all()
			require.Len(t, saved, 1)
			assert.Nil(t, saved[0].Moderation)
			assert.Equal(t, domain.CommentStatusPending, saved[0].Status)
		})
	}
}

// El campo trampa y los datos inválidos no llegan al clasificador: no gastan
// cuota.
func TestSubmitDoesNotClassifyDiscardedComments(t *testing.T) {
	provider := &fakeModerator{result: approveResult()}
	moderation, _ := newTestModeration(t, provider, time.Second)
	comments, _ := newModeratedCommentService(true, moderation)

	require.NoError(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "bot", Content: "spam", Trap: "https://spam.example"}))
	require.Error(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "", Content: "Hola"}))
	require.Error(t, comments.Submit(t.Context(), "borrador", CommentSubmission{Name: "Ana", Content: "Hola"}))

	assert.Empty(t, provider.calls())
}

func TestAnalyzeCommentReplacesTheModeration(t *testing.T) {
	result := approveResult()
	result.Verdict, result.Category = domain.ModerationVerdictReject, domain.ModerationCategorySpam
	provider := &fakeModerator{result: result}
	moderation, _ := newTestModeration(t, provider, time.Second)
	comments, repository := newModeratedCommentService(true, moderation)
	id := repository.insert(t, domain.Comment{
		PostID: "post-2", Name: "Bot", Content: "Compra ya", Status: domain.CommentStatusPending,
		Moderation: &domain.Moderation{Verdict: domain.ModerationVerdictApprove, Category: domain.ModerationCategoryNone, Reason: "antes"},
	})

	comment, err := comments.Analyze(t.Context(), id)

	require.NoError(t, err)
	assert.Equal(t, domain.ModerationVerdictReject, comment.Moderation.Verdict)
	assert.Equal(t, domain.CommentStatusPending, comment.Status, "analizar no cambia el estado")
	assert.Equal(t, "Otro", comment.PostTitle)
	assert.Equal(t, "otro", comment.PostSlug)
	assert.Equal(t, domain.ModerationCategorySpam, repository.all()[0].Moderation.Category)
	assert.Equal(t, []domain.CommentForModeration{{PostTitle: "Otro", Name: "Bot", Content: "Compra ya"}}, provider.calls())
}

func TestAnalyzeCommentErrors(t *testing.T) {
	t.Run("moderación apagada", func(t *testing.T) {
		comments, repository := newTestCommentService(true)
		id := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Content: "Hola", Status: domain.CommentStatusPending})

		_, err := comments.Analyze(t.Context(), id)

		require.ErrorIs(t, err, domain.ErrModerationDisabled)
	})

	t.Run("no existe", func(t *testing.T) {
		moderation, _ := newTestModeration(t, &fakeModerator{result: approveResult()}, time.Second)
		comments, _ := newModeratedCommentService(true, moderation)

		_, err := comments.Analyze(t.Context(), "comment-404")

		require.ErrorIs(t, err, domain.ErrNotFound)
	})

	t.Run("el clasificador falla y no se borra el análisis anterior", func(t *testing.T) {
		moderation, _ := newTestModeration(t, &fakeModerator{err: errors.New("boom")}, time.Second)
		comments, repository := newModeratedCommentService(true, moderation)
		previous := &domain.Moderation{Verdict: domain.ModerationVerdictApprove, Category: domain.ModerationCategoryNone, Reason: "antes"}
		id := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Content: "Hola", Status: domain.CommentStatusPending, Moderation: previous})

		_, err := comments.Analyze(t.Context(), id)

		require.ErrorIs(t, err, domain.ErrModerationUnavailable)
		assert.Equal(t, previous, repository.all()[0].Moderation)
	})
}

// La cola lleva el título y el slug actuales del post; un post que ya no
// existe deja los campos vacíos.
func TestListForModerationIncludesThePost(t *testing.T) {
	comments, repository := newTestCommentService(true)
	repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Content: "Hola", Status: domain.CommentStatusPending})
	repository.insert(t, domain.Comment{PostID: "post-404", Name: "Luis", Content: "Hola", Status: domain.CommentStatusPending})

	page, err := comments.List(t.Context(), domain.CommentStatusPending, 20, 0)

	require.NoError(t, err)
	require.Len(t, page.Comments, 2)
	assert.Equal(t, "Publicado", page.Comments[0].PostTitle)
	assert.Equal(t, "publicado", page.Comments[0].PostSlug)
	assert.Empty(t, page.Comments[1].PostTitle)
	assert.Empty(t, page.Comments[1].PostSlug)
}
