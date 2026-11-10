package service

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// fakeProvider es el proveedor del asistente para los tests (ADR-015): guarda
// los borradores que recibe y devuelve lo que se le configura.
type fakeProvider struct {
	drafts   []domain.Draft
	improved domain.ImprovedWriting
	metadata domain.MetadataSuggestion
	err      error
	// block hace que la llamada espere a que venza el contexto.
	block bool
}

var _ domain.WritingAssistant = (*fakeProvider)(nil)

func (f *fakeProvider) ImproveWriting(ctx context.Context, draft domain.Draft) (domain.ImprovedWriting, error) {
	f.drafts = append(f.drafts, draft)
	if err := f.wait(ctx); err != nil {
		return domain.ImprovedWriting{Usage: f.improved.Usage}, err
	}

	return f.improved, f.err
}

func (f *fakeProvider) SuggestMetadata(ctx context.Context, draft domain.Draft) (domain.MetadataSuggestion, error) {
	f.drafts = append(f.drafts, draft)
	if err := f.wait(ctx); err != nil {
		return domain.MetadataSuggestion{}, err
	}

	return f.metadata, f.err
}

func (f *fakeProvider) wait(ctx context.Context) error {
	if !f.block {
		return nil
	}

	<-ctx.Done()

	return errors.Join(domain.ErrAssistantUnavailable, ctx.Err())
}

var (
	testDraft = domain.Draft{Title: "Borrador secreto", Content: "# Contenido privado del borrador"}
	testUsage = domain.AssistantUsage{Model: "gemini-test", InputTokens: 120, OutputTokens: 80}
)

func newTestAssistant(t *testing.T, provider *fakeProvider, timeout time.Duration) (*AssistantService, *bytes.Buffer) {
	t.Helper()

	var logs bytes.Buffer
	service, err := NewAssistantService(provider, timeout, slog.New(slog.NewJSONHandler(&logs, nil)), time.Now)
	require.NoError(t, err)

	return service, &logs
}

func TestNewAssistantServiceRejectsMissingProviderOrTimeout(t *testing.T) {
	_, err := NewAssistantService(nil, time.Second, slog.Default(), time.Now)
	require.Error(t, err)

	_, err = NewAssistantService(&fakeProvider{}, 0, slog.Default(), time.Now)
	require.Error(t, err)
}

func TestDisabledAssistantNeverCallsAProvider(t *testing.T) {
	disabled := NewDisabledAssistant()

	_, err := disabled.ImproveWriting(t.Context(), testDraft)
	require.ErrorIs(t, err, domain.ErrAssistantDisabled)

	_, err = disabled.SuggestMetadata(t.Context(), testDraft)
	require.ErrorIs(t, err, domain.ErrAssistantDisabled)
}

func TestImproveWriting(t *testing.T) {
	provider := &fakeProvider{improved: domain.ImprovedWriting{Content: "# Mejor\n\nTexto.", Usage: testUsage}}
	assistant, _ := newTestAssistant(t, provider, time.Second)

	content, err := assistant.ImproveWriting(t.Context(), testDraft)

	require.NoError(t, err)
	assert.Equal(t, "# Mejor\n\nTexto.", content)
	// Solo el título y el contenido llegan al proveedor (ADR-021, punto 9).
	assert.Equal(t, []domain.Draft{testDraft}, provider.drafts)
}

func TestImproveWritingRejectsEmptyContent(t *testing.T) {
	provider := &fakeProvider{improved: domain.ImprovedWriting{Content: " \n "}}
	assistant, _ := newTestAssistant(t, provider, time.Second)

	_, err := assistant.ImproveWriting(t.Context(), testDraft)

	require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
}

func TestSuggestMetadataNormalizesLikeAPost(t *testing.T) {
	provider := &fakeProvider{metadata: domain.MetadataSuggestion{
		Title:   "  Orquestar agentes  ",
		Excerpt: " Un resumen. ",
		Tags:    []string{"IA", "  Agentes   de IA ", "ia", ""},
	}}
	assistant, _ := newTestAssistant(t, provider, time.Second)

	suggestion, err := assistant.SuggestMetadata(t.Context(), testDraft)

	require.NoError(t, err)
	assert.Equal(t, "Orquestar agentes", suggestion.Title)
	assert.Equal(t, "Un resumen.", suggestion.Excerpt)
	assert.Equal(t, []string{"ia", "agentes de ia"}, suggestion.Tags)
}

// Lo que no cumple las reglas de un post hace fallar la operación: no se
// recorta ni se corrige (ADR-021, punto 6).
func TestSuggestMetadataRejectsWhatAPostWouldNotAccept(t *testing.T) {
	valid := domain.MetadataSuggestion{Title: "Título", Excerpt: "Resumen.", Tags: []string{"go"}}
	tooManyTags := make([]string, MaxTags+1)
	for i := range tooManyTags {
		tooManyTags[i] = "tag" + strings.Repeat("x", i)
	}

	for name, change := range map[string]func(*domain.MetadataSuggestion){
		"título vacío":        func(m *domain.MetadataSuggestion) { m.Title = "   " },
		"título largo":        func(m *domain.MetadataSuggestion) { m.Title = strings.Repeat("á", MaxTitleLength+1) },
		"extracto vacío":      func(m *domain.MetadataSuggestion) { m.Excerpt = "" },
		"extracto largo":      func(m *domain.MetadataSuggestion) { m.Excerpt = strings.Repeat("é", MaxExcerptLength+1) },
		"demasiadas etiqueta": func(m *domain.MetadataSuggestion) { m.Tags = tooManyTags },
		"etiqueta larga":      func(m *domain.MetadataSuggestion) { m.Tags = []string{strings.Repeat("ñ", MaxTagLength+1)} },
	} {
		t.Run(name, func(t *testing.T) {
			suggestion := valid
			change(&suggestion)
			assistant, _ := newTestAssistant(t, &fakeProvider{metadata: suggestion}, time.Second)

			_, err := assistant.SuggestMetadata(t.Context(), testDraft)

			require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
		})
	}
}

func TestSuggestMetadataAcceptsTheLimits(t *testing.T) {
	provider := &fakeProvider{metadata: domain.MetadataSuggestion{
		Title:   strings.Repeat("á", MaxTitleLength),
		Excerpt: strings.Repeat("é", MaxExcerptLength),
		Tags:    []string{strings.Repeat("ñ", MaxTagLength)},
	}}
	assistant, _ := newTestAssistant(t, provider, time.Second)

	_, err := assistant.SuggestMetadata(t.Context(), testDraft)

	require.NoError(t, err)
}

func TestAssistantPassesProviderErrorsThrough(t *testing.T) {
	provider := &fakeProvider{err: errors.Join(domain.ErrAssistantUnavailable, errors.New("gemini responded 429 RESOURCE_EXHAUSTED"))}
	assistant, logs := newTestAssistant(t, provider, time.Second)

	_, err := assistant.ImproveWriting(t.Context(), testDraft)

	require.ErrorIs(t, err, domain.ErrAssistantUnavailable)
	assert.Contains(t, logs.String(), `"result":"unavailable"`)
	assert.Contains(t, logs.String(), `"level":"WARN"`)
}

func TestAssistantTimesOut(t *testing.T) {
	provider := &fakeProvider{block: true}
	assistant, logs := newTestAssistant(t, provider, 20*time.Millisecond)

	start := time.Now()
	_, err := assistant.SuggestMetadata(t.Context(), testDraft)

	require.ErrorIs(t, err, domain.ErrAssistantUnavailable)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Less(t, time.Since(start), time.Second)
	assert.Contains(t, logs.String(), `"result":"timeout"`)
}

// El log tiene modelo, latencia, tokens y resultado, y nunca el contenido
// (ADR-021, punto 9).
func TestAssistantLogsUsageButNeverTheDraft(t *testing.T) {
	provider := &fakeProvider{improved: domain.ImprovedWriting{Content: "Texto sugerido privado", Usage: testUsage}}
	assistant, logs := newTestAssistant(t, provider, time.Second)

	_, err := assistant.ImproveWriting(t.Context(), testDraft)
	require.NoError(t, err)

	line := logs.String()
	for _, want := range []string{`"operation":"improve_writing"`, `"model":"gemini-test"`, `"input_tokens":120`, `"output_tokens":80`, `"result":"ok"`, `"latency_ms":`} {
		assert.Contains(t, line, want)
	}
	for _, private := range []string{testDraft.Title, testDraft.Content, "Texto sugerido privado"} {
		assert.NotContains(t, line, private)
	}
}
