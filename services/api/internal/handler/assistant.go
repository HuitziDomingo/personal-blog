package handler

import (
	"context"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const (
	assistantPathPrefix = "/api/v1/admin/assistant/"

	detailAssistantDisabled      = "writing assistant is disabled"
	detailAssistantUnavailable   = "writing assistant is unavailable, try again later"
	detailAssistantInvalidOutput = "writing assistant returned an invalid suggestion, try again"

	// assistantWriteMargin es lo que se suma al timeout del proveedor para
	// escribir la respuesta.
	assistantWriteMargin = 10 * time.Second
)

// Assistant es lo que los handlers necesitan del asistente de escritura.
type Assistant interface {
	ImproveWriting(ctx context.Context, draft domain.Draft) (string, error)
	SuggestMetadata(ctx context.Context, draft domain.Draft) (domain.MetadataSuggestion, error)
	SuggestCover(ctx context.Context, draft domain.Draft) (domain.CoverSuggestion, error)
}

// ImproveWriting devuelve el contenido del borrador reescrito. No guarda nada.
func (s server) ImproveWriting(ctx context.Context, request gen.ImproveWritingRequestObject) (gen.ImproveWritingResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	content, err := s.assistant.ImproveWriting(ctx, toDraft(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.ImproveWriting200JSONResponse{Content: content}, nil
}

// SuggestMetadata devuelve título, extracto y etiquetas para el borrador. No
// guarda nada.
func (s server) SuggestMetadata(ctx context.Context, request gen.SuggestMetadataRequestObject) (gen.SuggestMetadataResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	suggestion, err := s.assistant.SuggestMetadata(ctx, toDraft(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.SuggestMetadata200JSONResponse{
		Title:   suggestion.Title,
		Excerpt: suggestion.Excerpt,
		Tags:    nonNil(suggestion.Tags),
	}, nil
}

// SuggestCover devuelve la idea de la portada del borrador: tema y texto
// alternativo, ya validados por el service. No genera ninguna imagen ni guarda
// nada (ADR-026, punto 2).
func (s server) SuggestCover(ctx context.Context, request gen.SuggestCoverRequestObject) (gen.SuggestCoverResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	suggestion, err := s.assistant.SuggestCover(ctx, toDraft(*request.Body))
	if err != nil {
		return nil, err
	}

	return gen.SuggestCover200JSONResponse{Subject: suggestion.Subject, Alt: suggestion.Alt}, nil
}

func toDraft(body gen.AssistantDraft) domain.Draft {
	return domain.Draft{Title: body.Title, Content: body.Content}
}
