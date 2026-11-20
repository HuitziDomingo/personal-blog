package domain

import (
	"context"
	"errors"
)

// Errores de las portadas generadas con IA (ADR-026). Todos, salvo
// ErrInvalidCoverPreview, se responden con 503.
var (
	// ErrImagesDisabled indica que la generación de portadas está apagada por
	// configuración (IMAGES_ENABLED=false).
	ErrImagesDisabled = errors.New("image generation is disabled")

	// ErrImagesQuotaExceeded indica que el proveedor rechazó la petición
	// porque se agotó su cuota gratuita del día.
	ErrImagesQuotaExceeded = errors.New("image generation quota exhausted")

	// ErrImagesUnavailable indica que el proveedor falló, tardó más que el
	// timeout o devolvió una imagen que no se puede usar.
	ErrImagesUnavailable = errors.New("image generation is unavailable")

	// ErrCoverStoreUnavailable indica que no se pudo guardar la portada.
	ErrCoverStoreUnavailable = errors.New("cover storage is unavailable")

	// ErrInvalidCoverPreview indica que la vista previa que se acepta no es
	// una que generó la API para ese post y ese usuario, o ya venció.
	ErrInvalidCoverPreview = errors.New("invalid or expired cover preview")
)

// Cover es la portada de un post (ADR-026, punto 5).
type Cover struct {
	URL         string
	Alt         string
	AIGenerated bool
	// BlurDataURL es un placeholder diminuto (data:image/png;base64) que la
	// web muestra borroso mientras carga la imagen. Vacío en portadas
	// guardadas antes de que existiera.
	BlurDataURL string
}

// GeneratedImage es la imagen tal como la devolvió el proveedor: bytes sin
// verificar, que el service comprueba antes de usarlos y guarda tal cual.
type GeneratedImage struct {
	Data  []byte
	Model string
}

// ImageGenerator es el puerto del proveedor de imágenes (ADR-026, punto 3).
// Una llamada por imagen, sin reintentos. Un error del proveedor se devuelve
// envuelto en ErrImagesUnavailable o en ErrImagesQuotaExceeded, y su texto
// nunca incluye el prompt ni el token.
type ImageGenerator interface {
	Generate(ctx context.Context, prompt string) (GeneratedImage, error)
}
