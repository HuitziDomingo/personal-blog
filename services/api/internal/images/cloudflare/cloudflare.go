// Package cloudflare implementa domain.ImageGenerator con Workers AI de
// Cloudflare y FLUX.1 [schnell] (ADR-026). Usa la API REST con net/http, sin
// SDK.
package cloudflare

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// Model es el modelo de Workers AI: licencia Apache-2.0 y retención cero
	// de datos según su ficha.
	Model = "@cf/black-forest-labs/flux-1-schnell"

	// DefaultBaseURL es la API REST de Cloudflare.
	DefaultBaseURL = "https://api.cloudflare.com/client/v4"

	// steps es el valor por defecto del modelo (máximo 8): más pasos cuestan
	// más neuronas de la cuota gratuita.
	steps = 4

	// maxResponseBytes acota la respuesta: una imagen en base64 de 1024 ×
	// 1024 pesa menos de 2 MiB.
	maxResponseBytes = 8 << 20

	// codeDailyQuota es el error de Workers AI cuando se agotan las neuronas
	// gratuitas del día ("You have used up your daily free allocation of
	// 10,000 neurons").
	codeDailyQuota = 3036
)

// accountIDPattern es el formato de un Account ID de Cloudflare: 32
// caracteres hexadecimales. Validarlo evita que un valor mal copiado cambie la
// ruta de la petición.
var accountIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// Config es la configuración del adaptador.
type Config struct {
	AccountID string
	// Token es un API token con permisos solo para Workers AI.
	Token string
	// BaseURL es DefaultBaseURL si está vacía; los tests apuntan a httptest.
	BaseURL string
	// HTTPClient es http.DefaultClient si es nil. El timeout lo pone el
	// contexto de cada llamada.
	HTTPClient *http.Client
}

// Generator llama a Workers AI.
type Generator struct {
	endpoint string
	token    string
	client   *http.Client
}

var _ domain.ImageGenerator = (*Generator)(nil)

// New valida la configuración y crea el adaptador.
func New(cfg Config) (*Generator, error) {
	if !accountIDPattern.MatchString(cfg.AccountID) {
		return nil, errors.New("cloudflare account id must be 32 lowercase hex characters")
	}

	if cfg.Token == "" {
		return nil, errors.New("cloudflare token is empty")
	}

	base := cfg.BaseURL
	if base == "" {
		base = DefaultBaseURL
	}

	if _, err := url.Parse(base); err != nil {
		return nil, fmt.Errorf("cloudflare base url: %w", err)
	}

	client := cfg.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	return &Generator{
		endpoint: strings.TrimRight(base, "/") + "/accounts/" + cfg.AccountID + "/ai/run/" + Model,
		token:    cfg.Token,
		client:   client,
	}, nil
}

type runRequest struct {
	Prompt string `json:"prompt"`
	Steps  int    `json:"steps"`
}

type runResponse struct {
	Success bool `json:"success"`
	Result  struct {
		Image string `json:"image"`
	} `json:"result"`
	Errors []struct {
		Code int `json:"code"`
	} `json:"errors"`
}

// Generate pide una imagen. Una sola llamada, sin reintentos. Los errores
// llevan el estado HTTP y los códigos de Cloudflare, nunca el prompt, el
// token ni los mensajes del proveedor.
func (g *Generator) Generate(ctx context.Context, prompt string) (domain.GeneratedImage, error) {
	body, err := json.Marshal(runRequest{Prompt: prompt, Steps: steps})
	if err != nil {
		return domain.GeneratedImage{}, fmt.Errorf("%w: encode request: %w", domain.ErrImagesUnavailable, err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, g.endpoint, bytes.NewReader(body))
	if err != nil {
		return domain.GeneratedImage{}, fmt.Errorf("%w: build request: %w", domain.ErrImagesUnavailable, err)
	}

	request.Header.Set("Authorization", "Bearer "+g.token)
	request.Header.Set("Content-Type", "application/json")

	response, err := g.client.Do(request)
	if err != nil {
		// El error de net/http incluye la URL, que lleva el Account ID pero
		// no el token. Se descarta igual: basta saber si fue el contexto.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return domain.GeneratedImage{}, fmt.Errorf("%w: %w", domain.ErrImagesUnavailable, ctxErr)
		}

		return domain.GeneratedImage{}, fmt.Errorf("%w: request failed", domain.ErrImagesUnavailable)
	}
	defer func() { _ = response.Body.Close() }()

	var decoded runResponse
	decodeErr := json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(&decoded)

	if response.StatusCode != http.StatusOK || decodeErr != nil || !decoded.Success {
		return domain.GeneratedImage{}, providerError(response.StatusCode, decoded, decodeErr)
	}

	image, err := base64.StdEncoding.DecodeString(decoded.Result.Image)
	if err != nil || len(image) == 0 {
		return domain.GeneratedImage{}, fmt.Errorf("%w: image is not valid base64", domain.ErrImagesUnavailable)
	}

	return domain.GeneratedImage{Data: image, Model: Model}, nil
}

// providerError traduce la respuesta de error. Solo la cuota diaria agotada es
// ErrImagesQuotaExceeded; un 429 por capacidad (3040) se puede reintentar más
// tarde y es ErrImagesUnavailable.
func providerError(status int, decoded runResponse, decodeErr error) error {
	codes := make([]string, 0, len(decoded.Errors))
	for _, providerErr := range decoded.Errors {
		if providerErr.Code == codeDailyQuota {
			return fmt.Errorf("%w: status %d, code %d", domain.ErrImagesQuotaExceeded, status, codeDailyQuota)
		}

		codes = append(codes, fmt.Sprint(providerErr.Code))
	}

	if decodeErr != nil {
		return fmt.Errorf("%w: status %d, unreadable response", domain.ErrImagesUnavailable, status)
	}

	return fmt.Errorf("%w: status %d, codes [%s]", domain.ErrImagesUnavailable, status, strings.Join(codes, ","))
}
