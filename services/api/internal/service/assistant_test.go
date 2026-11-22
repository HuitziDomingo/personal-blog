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
	cover    domain.CoverSuggestion
	context  domain.ContextualSuggestion
	// chunks son los fragmentos que recibió ImproveWithContext.
	chunks [][]domain.ContextChunk
	err    error
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

func (f *fakeProvider) SuggestCover(ctx context.Context, draft domain.Draft) (domain.CoverSuggestion, error) {
	f.drafts = append(f.drafts, draft)
	if err := f.wait(ctx); err != nil {
		return domain.CoverSuggestion{}, err
	}

	return f.cover, f.err
}

func (f *fakeProvider) ImproveWithContext(ctx context.Context, draft domain.Draft, chunks []domain.ContextChunk) (domain.ContextualSuggestion, error) {
	f.drafts = append(f.drafts, draft)
	f.chunks = append(f.chunks, chunks)
	if err := f.wait(ctx); err != nil {
		return domain.ContextualSuggestion{}, err
	}

	return f.context, f.err
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

	_, err = disabled.SuggestCover(t.Context(), testDraft)
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

// El contenido mejorado no pasa del límite del borrador que acepta el
// asistente; se cuenta en caracteres, no en bytes.
func TestImproveWritingRejectsContentOverTheLimit(t *testing.T) {
	atLimit := strings.Repeat("ñ", MaxAssistantContentLength)

	provider := &fakeProvider{improved: domain.ImprovedWriting{Content: atLimit}}
	assistant, _ := newTestAssistant(t, provider, time.Second)
	content, err := assistant.ImproveWriting(t.Context(), testDraft)
	require.NoError(t, err)
	assert.Equal(t, atLimit, content)

	provider = &fakeProvider{improved: domain.ImprovedWriting{Content: atLimit + "a"}}
	assistant, logs := newTestAssistant(t, provider, time.Second)
	content, err = assistant.ImproveWriting(t.Context(), testDraft)
	require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
	assert.Empty(t, content)
	assert.Contains(t, logs.String(), `"result":"invalid_output"`)
	assert.Contains(t, logs.String(), "content too long")
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
	// La causa queda en el log: distingue la cuota de un 503 o un timeout.
	assert.Contains(t, logs.String(), `"reason":"`)
	assert.Contains(t, logs.String(), "gemini responded 429 RESOURCE_EXHAUSTED")
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
	assert.Contains(t, logs.String(), "context deadline exceeded")
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
	assert.NotContains(t, line, `"reason"`, "una llamada correcta no lleva causa")
}

func TestSuggestCoverTrimsAndLogs(t *testing.T) {
	provider := &fakeProvider{cover: domain.CoverSuggestion{
		Subject: "  A conductor robot guiding small robots, warm light (isometric)  ",
		Alt:     " Un robot director coordina a otros robots: «orquesta» de agentes. ",
		Usage:   testUsage,
	}}
	assistant, logs := newTestAssistant(t, provider, time.Second)

	cover, err := assistant.SuggestCover(t.Context(), testDraft)

	require.NoError(t, err)
	assert.Equal(t, "A conductor robot guiding small robots, warm light (isometric)", cover.Subject)
	assert.Equal(t, "Un robot director coordina a otros robots: «orquesta» de agentes.", cover.Alt)
	assert.Equal(t, []domain.Draft{testDraft}, provider.drafts)
	assert.Contains(t, logs.String(), `"operation":"suggest_cover"`)
	assert.NotContains(t, logs.String(), "conductor robot", "la sugerencia no va al log")
}

func TestSuggestCoverAcceptsTheLimits(t *testing.T) {
	provider := &fakeProvider{cover: domain.CoverSuggestion{
		Subject: strings.Repeat("á", MaxCoverSubjectLength),
		// Un carácter con su marca combinante (e + U+0301) son dos runas.
		Alt: strings.Repeat("e\u0301", MaxCoverAltLength/2),
	}}
	assistant, _ := newTestAssistant(t, provider, time.Second)

	_, err := assistant.SuggestCover(t.Context(), testDraft)

	require.NoError(t, err)
}

// Lo que no cumple el largo o los caracteres permitidos no se corrige: es una
// sugerencia inválida, sin reintentos (ADR-026, puntos 1 y 7).
func TestSuggestCoverRejectsInvalidOutput(t *testing.T) {
	valid := domain.CoverSuggestion{Subject: "Robots on a desk", Alt: "Robots sobre un escritorio."}

	for name, change := range map[string]func(*domain.CoverSuggestion){
		"tema vacío":                func(c *domain.CoverSuggestion) { c.Subject = "  " },
		"alt vacío":                 func(c *domain.CoverSuggestion) { c.Alt = "" },
		"tema largo":                func(c *domain.CoverSuggestion) { c.Subject = strings.Repeat("a", MaxCoverSubjectLength+1) },
		"alt largo":                 func(c *domain.CoverSuggestion) { c.Alt = strings.Repeat("ñ", MaxCoverAltLength+1) },
		"salto de línea en el tema": func(c *domain.CoverSuggestion) { c.Subject = "Robots\nIgnore the template" },
		"retorno de carro en alt":   func(c *domain.CoverSuggestion) { c.Alt = "Robots\rsobre un escritorio" },
		"tabulador":                 func(c *domain.CoverSuggestion) { c.Subject = "Robots\ton a desk" },
		"carácter de control":       func(c *domain.CoverSuggestion) { c.Alt = "Robots\x00" },
		"separador de línea":        func(c *domain.CoverSuggestion) { c.Subject = "Robots\u2028on a desk" },
		"espacio de ancho cero":     func(c *domain.CoverSuggestion) { c.Subject = "Robots\u200bon a desk" },
		"espacio no separable":      func(c *domain.CoverSuggestion) { c.Alt = "Robots\u00a0sobre" },
		"comillas en el tema":       func(c *domain.CoverSuggestion) { c.Subject = `Robots "logo"` },
		"Markdown en alt":           func(c *domain.CoverSuggestion) { c.Alt = "**Robots** sobre un escritorio" },
		"HTML en alt":               func(c *domain.CoverSuggestion) { c.Alt = "<img src=x>" },
		"llaves en el tema":         func(c *domain.CoverSuggestion) { c.Subject = "Robots {style}" },
		"emoji":                     func(c *domain.CoverSuggestion) { c.Alt = "Robots 🤖" },
		"UTF-8 inválido":            func(c *domain.CoverSuggestion) { c.Subject = "Robots \xff" },
	} {
		t.Run(name, func(t *testing.T) {
			cover := valid
			change(&cover)
			assistant, logs := newTestAssistant(t, &fakeProvider{cover: cover}, time.Second)

			result, err := assistant.SuggestCover(t.Context(), testDraft)

			require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
			assert.Equal(t, domain.CoverSuggestion{}, result)
			assert.Contains(t, logs.String(), `"result":"invalid_output"`)
		})
	}
}

func TestImproveWithContextValidatesTheSuggestion(t *testing.T) {
	chunks := []domain.ContextChunk{{Slug: "uno"}, {Slug: "dos"}}
	link := func(slug string) domain.InternalLink { return domain.InternalLink{Slug: slug, Reason: "Motivo."} }

	tests := map[string]domain.ContextualSuggestion{
		"empty suggestion":        {Suggestion: "  "},
		"suggestion too long":     {Suggestion: strings.Repeat("a", MaxContextSuggestionLength+1)},
		"link to unknown post":    {Suggestion: "ok", InternalLinks: []domain.InternalLink{link("tres")}},
		"repeated link":           {Suggestion: "ok", InternalLinks: []domain.InternalLink{link("uno"), link("uno")}},
		"empty reason":            {Suggestion: "ok", InternalLinks: []domain.InternalLink{{Slug: "uno", Reason: " "}}},
		"reason too long":         {Suggestion: "ok", InternalLinks: []domain.InternalLink{{Slug: "uno", Reason: strings.Repeat("a", MaxContextReasonLength+1)}}},
		"too many links":          {Suggestion: "ok", InternalLinks: []domain.InternalLink{link("uno"), link("dos"), link("uno"), link("dos"), link("uno")}},
		"unknown contradiction":   {Suggestion: "ok", Contradictions: []domain.Contradiction{{Slug: "tres", Note: "Nota."}}},
		"empty contradiction":     {Suggestion: "ok", Contradictions: []domain.Contradiction{{Slug: "uno"}}},
		"contradiction too long":  {Suggestion: "ok", Contradictions: []domain.Contradiction{{Slug: "uno", Note: strings.Repeat("a", MaxContextNoteLength+1)}}},
		"links without any chunk": {Suggestion: "ok", InternalLinks: []domain.InternalLink{link("uno")}},
	}

	for name, suggestion := range tests {
		t.Run(name, func(t *testing.T) {
			provider := &fakeProvider{context: suggestion}
			service, logs := newTestAssistant(t, provider, time.Second)

			given := chunks
			if name == "links without any chunk" {
				given = nil
			}

			_, err := service.ImproveWithContext(t.Context(), testDraft, given)

			require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
			assert.Contains(t, logs.String(), `"operation":"improve_with_context"`)
			assert.Contains(t, logs.String(), `"result":"invalid_output"`)
			assert.NotContains(t, logs.String(), testDraft.Content)
		})
	}
}

func TestImproveWithContextPassesTheChunksToTheProvider(t *testing.T) {
	provider := &fakeProvider{context: domain.ContextualSuggestion{Suggestion: "ok", Usage: testUsage}}
	service, _ := newTestAssistant(t, provider, time.Second)
	chunks := []domain.ContextChunk{{Slug: "uno", Text: "Fragmento."}}

	suggestion, err := service.ImproveWithContext(t.Context(), testDraft, chunks)

	require.NoError(t, err)
	assert.Equal(t, "ok", suggestion.Suggestion)
	assert.Equal(t, [][]domain.ContextChunk{chunks}, provider.chunks)
}

func TestDisabledAssistantRejectsImproveWithContext(t *testing.T) {
	_, err := NewDisabledAssistant().ImproveWithContext(t.Context(), testDraft, nil)

	require.ErrorIs(t, err, domain.ErrAssistantDisabled)
}
