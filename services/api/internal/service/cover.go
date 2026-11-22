package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/imaging"
)

// CoverPreviewTTL es cuánto tiempo se puede aceptar una vista previa.
const CoverPreviewTTL = 30 * time.Minute

// coverKeyHashBytes son los bytes del SHA-256 de la imagen que van en su
// clave: 96 bits bastan para que dos portadas de un post no choquen.
const coverKeyHashBytes = 12

// Resultados de una llamada al generador, para el log.
const (
	imageResultOK            = "ok"
	imageResultTimeout       = "timeout"
	imageResultQuota         = "quota_exceeded"
	imageResultUnavailable   = "unavailable"
	imageResultInvalidOutput = "invalid_output"
)

// coverPromptTemplate es la plantilla cerrada del prompt de imagen (ADR-026,
// punto 7). Lo único variable es el tema, que ya pasó la validación de
// SuggestCover: sin saltos de línea ni símbolos con significado en un prompt.
const coverPromptTemplate = "Editorial cover illustration for a technical blog post about: %s. " +
	"Clean modern digital illustration, wide 16:9 landscape composition, soft lighting, restrained color palette, " +
	"abstract and symbolic shapes and objects. " +
	"No people, no faces, no human figures, no real persons, no celebrities. " +
	"No brands, no logos, no trademarks, no product names. " +
	"No text, no letters, no words, no numbers, no captions, no watermarks, no signatures. " +
	"Not in the style of any named artist."

// CoverPrompt arma el prompt de imagen con la plantilla cerrada.
func CoverPrompt(subject string) string {
	return fmt.Sprintf(coverPromptTemplate, subject)
}

// coverSuggester es lo que el service necesita del asistente: la idea de la
// portada, ya validada (AssistantService.SuggestCover).
type coverSuggester interface {
	SuggestCover(ctx context.Context, draft domain.Draft) (domain.CoverSuggestion, error)
}

// CoverPreview es una portada generada que todavía no se guardó.
type CoverPreview struct {
	Image       []byte
	ContentType string
	Width       int
	Height      int
	Subject     string
	Alt         string
	Token       string
	ExpiresAt   time.Time
}

// CoverAcceptance es la vista previa que el admin reenvía para aceptarla.
type CoverAcceptance struct {
	Image []byte
	Token string
	Alt   string
}

// CoverDeps son las piezas del service de portadas.
type CoverDeps struct {
	Posts     domain.PostRepository
	Assistant coverSuggester
	Generator domain.ImageGenerator
	Store     domain.FileStore
	// Secret es JWT_SECRET: de él se deriva la clave de las vistas previas.
	Secret  []byte
	Timeout time.Duration
	Logger  *slog.Logger
	Now     func() time.Time
}

// CoverService genera portadas con IA y guarda las que el autor acepta
// (ADR-026). Sin generador, toda operación devuelve domain.ErrImagesDisabled.
type CoverService struct {
	deps   CoverDeps
	signer previewSigner
}

// NewCoverService crea el service. Todas las piezas son obligatorias y el
// timeout debe ser positivo: la llamada al proveedor quedaría sin límite.
func NewCoverService(deps CoverDeps) (*CoverService, error) {
	switch {
	case deps.Posts == nil || deps.Assistant == nil || deps.Generator == nil || deps.Store == nil:
		return nil, errors.New("cover service needs posts, an assistant, a generator and a store")
	case deps.Timeout <= 0:
		return nil, fmt.Errorf("image timeout must be positive: %s", deps.Timeout)
	case deps.Logger == nil || deps.Now == nil:
		return nil, errors.New("cover service needs a logger and a clock")
	}

	signer, err := newPreviewSigner(deps.Secret)
	if err != nil {
		return nil, err
	}

	return &CoverService{deps: deps, signer: signer}, nil
}

// NewDisabledCovers es el service con IMAGES_ENABLED=false: generar y aceptar
// devuelven domain.ErrImagesDisabled y nada llega a un proveedor.
func NewDisabledCovers() *CoverService {
	return &CoverService{}
}

// Preview genera la portada de un post guardado y la devuelve sin guardarla
// (ADR-026, puntos 1 y 4): primero Gemini propone el tema, después la API lo
// pone en la plantilla cerrada y llama al generador. Sin reintentos.
func (s *CoverService) Preview(ctx context.Context, userID, postID string) (CoverPreview, error) {
	if s.deps.Generator == nil {
		return CoverPreview{}, domain.ErrImagesDisabled
	}

	post, err := s.deps.Posts.GetByID(ctx, postID)
	if err != nil {
		return CoverPreview{}, fmt.Errorf("cover preview: %w", err)
	}

	// Solo el post del autor, nunca comentarios ni otra entrada de lectores
	// (ADR-026, punto 7).
	suggestion, err := s.deps.Assistant.SuggestCover(ctx, domain.Draft{Title: post.Title, Content: post.Content})
	if err != nil {
		return CoverPreview{}, fmt.Errorf("cover preview: %w", err)
	}

	cover, info, err := s.generate(ctx, suggestion.Subject)
	if err != nil {
		return CoverPreview{}, fmt.Errorf("cover preview: %w", err)
	}

	expiresAt := s.deps.Now().Add(CoverPreviewTTL).UTC().Truncate(time.Second)

	return CoverPreview{
		Image:       cover,
		ContentType: info.ContentType,
		Width:       info.Width,
		Height:      info.Height,
		Subject:     suggestion.Subject,
		Alt:         suggestion.Alt,
		Token:       s.signer.sign(userID, post.ID, cover, expiresAt),
		ExpiresAt:   expiresAt,
	}, nil
}

// generate llama al generador con timeout, verifica la imagen sin
// recodificarla ni recortarla (se guarda tal cual; el recorte 16:9 lo hace la
// web) y deja un log con modelo, latencia, formato, tamaño y resultado, nunca
// con el prompt.
func (s *CoverService) generate(ctx context.Context, subject string) ([]byte, imaging.Info, error) {
	ctx, cancel := context.WithTimeout(ctx, s.deps.Timeout)
	defer cancel()

	start := s.deps.Now()
	generated, err := s.deps.Generator.Generate(ctx, CoverPrompt(subject))

	var info imaging.Info
	if err == nil {
		info, err = imaging.Inspect(generated.Data)
		if err != nil {
			err = fmt.Errorf("%w: %w", domain.ErrImagesUnavailable, err)
		}
	}

	attrs := []any{
		"operation", "generate_cover",
		"model", generated.Model,
		"latency_ms", s.deps.Now().Sub(start).Milliseconds(),
		"format", info.Name,
		"width", info.Width,
		"height", info.Height,
		"cover_bytes", len(generated.Data),
		"result", imageResultOf(err),
	}

	level := slog.LevelInfo
	if err != nil {
		level = slog.LevelWarn
		attrs = append(attrs, "reason", err.Error())
	}

	s.deps.Logger.Log(ctx, level, "image generator call", attrs...)

	if err != nil {
		return nil, imaging.Info{}, fmt.Errorf("generate cover: %w", err)
	}

	return generated.Data, info, nil
}

func imageResultOf(err error) string {
	switch {
	case err == nil:
		return imageResultOK
	case errors.Is(err, context.DeadlineExceeded):
		return imageResultTimeout
	case errors.Is(err, domain.ErrImagesQuotaExceeded):
		return imageResultQuota
	case errors.Is(err, imaging.ErrInvalidImage):
		return imageResultInvalidOutput
	default:
		return imageResultUnavailable
	}
}

// Accept guarda la vista previa y la asigna como portada del post (ADR-026,
// punto 4). No confía en el cliente: la firma prueba que la API generó esos
// bytes para ese post y ese usuario, y los bytes se verifican de nuevo.
func (s *CoverService) Accept(ctx context.Context, userID, postID string, acceptance CoverAcceptance) (*domain.Post, error) {
	if s.deps.Generator == nil {
		return nil, domain.ErrImagesDisabled
	}

	if err := s.signer.verify(acceptance.Token, userID, postID, acceptance.Image, s.deps.Now()); err != nil {
		return nil, fmt.Errorf("accept cover: %w", err)
	}

	// La firma ya prueba que la API generó estos bytes; se verifican de nuevo
	// por si cambió el formato aceptado entre la vista previa y el guardado.
	info, err := imaging.Inspect(acceptance.Image)
	if err != nil {
		return nil, fmt.Errorf("accept cover: %w: %w", domain.ErrInvalidCoverPreview, err)
	}

	blur, err := imaging.BlurDataURL(acceptance.Image)
	if err != nil {
		return nil, fmt.Errorf("accept cover: %w: %w", domain.ErrInvalidCoverPreview, err)
	}

	alt := strings.TrimSpace(acceptance.Alt)
	if err := validateCoverField("alt", alt, MaxCoverAltLength, coverAltPunctuation, domain.ErrInvalidInput); err != nil {
		return nil, fmt.Errorf("accept cover: %w", err)
	}

	post, err := s.deps.Posts.GetByID(ctx, postID)
	if err != nil {
		return nil, fmt.Errorf("accept cover: %w", err)
	}

	digest := sha256.Sum256(acceptance.Image)
	url, err := s.deps.Store.Put(ctx, domain.StoredFile{
		Key:         fmt.Sprintf("covers/%s/%s.%s", post.ID, hex.EncodeToString(digest[:coverKeyHashBytes]), info.Extension),
		ContentType: info.ContentType,
		// La web muestra la portada en un <img>: inline, no como descarga.
		ContentDisposition: "inline",
		Data:               acceptance.Image,
	})
	if err != nil {
		return nil, fmt.Errorf("accept cover: %w: %w", domain.ErrCoverStoreUnavailable, err)
	}

	post.Cover = &domain.Cover{URL: url, Alt: alt, AIGenerated: true, BlurDataURL: blur}
	post.UpdatedAt = s.deps.Now().UTC().Truncate(time.Millisecond)

	if err := s.deps.Posts.Update(ctx, post); err != nil {
		return nil, fmt.Errorf("accept cover: %w", err)
	}

	return post, nil
}
