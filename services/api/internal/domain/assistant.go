package domain

import (
	"context"
	"errors"
)

// Errores del asistente de escritura (ADR-021). Los tres se responden con 503:
// el cliente no puede hacer nada distinto con la misma petición.
var (
	// ErrAssistantDisabled indica que el asistente está apagado por
	// configuración (ASSISTANT_ENABLED=false).
	ErrAssistantDisabled = errors.New("writing assistant is disabled")

	// ErrAssistantUnavailable indica que el proveedor falló, tardó más que el
	// timeout o rechazó la petición, por ejemplo por cuota.
	ErrAssistantUnavailable = errors.New("writing assistant is unavailable")

	// ErrAssistantInvalidOutput indica que el proveedor respondió, pero con una
	// sugerencia que no cumple las reglas de un post.
	ErrAssistantInvalidOutput = errors.New("writing assistant returned an invalid suggestion")
)

// Draft es lo único que se envía al proveedor: el título y el contenido de un
// borrador. Nunca datos de usuarios, secretos ni otros posts (ADR-021).
type Draft struct {
	Title   string
	Content string
}

// AssistantUsage describe una llamada al proveedor para los logs: modelo y
// tokens. Nunca el contenido.
type AssistantUsage struct {
	Model        string
	InputTokens  int
	OutputTokens int
}

// ImprovedWriting es el contenido reescrito, en Markdown y sin validar: es
// texto no confiable, que se sanitiza al renderizar como cualquier post.
type ImprovedWriting struct {
	Content string
	Usage   AssistantUsage
}

// MetadataSuggestion son el título, el extracto y las etiquetas sugeridos.
type MetadataSuggestion struct {
	Title   string
	Excerpt string
	Tags    []string
	Usage   AssistantUsage
}

// WritingAssistant es el puerto del proveedor del asistente (ADR-021). Cada
// método es una sola llamada al modelo, sin herramientas ni reintentos. Un
// error del proveedor se devuelve envuelto en ErrAssistantUnavailable, y su
// texto nunca incluye el borrador ni la API key.
type WritingAssistant interface {
	ImproveWriting(ctx context.Context, draft Draft) (ImprovedWriting, error)
	SuggestMetadata(ctx context.Context, draft Draft) (MetadataSuggestion, error)
}
