package domain

import (
	"context"
	"errors"
)

// EmbeddingDimensions es el tamaño de los vectores del índice (ADR-027, punto
// 2). Vectores de otro tamaño no se guardan ni se comparan.
const EmbeddingDimensions = 768

// ErrRAGDisabled indica que el RAG está apagado por configuración
// (RAG_ENABLED=false). Se responde con 503, como el asistente apagado.
var ErrRAGDisabled = errors.New("rag is disabled")

// EmbeddingDocument es un fragmento tal como se convierte en embedding de
// documento: el título le da contexto al texto (por ejemplo, «Post — Sección»).
type EmbeddingDocument struct {
	Title string
	Text  string
}

// Embedder es el puerto del proveedor de embeddings (ADR-027, punto 2). Los
// documentos y la consulta se generan con su tipo de tarea: no son
// intercambiables. Un error del proveedor se devuelve envuelto en
// ErrAssistantUnavailable y su texto nunca incluye el contenido ni la API key.
type Embedder interface {
	// Model es el modelo que genera los vectores. Se guarda con cada
	// fragmento: vectores de modelos distintos no se comparan (punto 6).
	Model() string
	// EmbedDocuments devuelve un vector de EmbeddingDimensions por documento,
	// en el mismo orden.
	EmbedDocuments(ctx context.Context, documents []EmbeddingDocument) ([][]float32, error)
	// EmbedQuery devuelve el vector de una consulta.
	EmbedQuery(ctx context.Context, text string) ([]float32, error)
}

// Chunk es un fragmento indexado de un post publicado (ADR-027, punto 4).
type Chunk struct {
	PostID    string
	Slug      string
	PostTitle string
	// Section es el título del ## al que pertenece; vacío para el texto antes
	// del primer ##.
	Section string
	// Position es el orden del fragmento dentro del post, desde 0.
	Position  int
	Text      string
	Embedding []float32
	Model     string
	// ContentHash identifica el contenido del post que se indexó: si no
	// cambia, no se vuelven a generar los embeddings.
	ContentHash string
}

// PostIndexState es cómo está indexado un post: con qué contenido y con qué
// modelo, y cuántos fragmentos tiene.
type PostIndexState struct {
	PostID      string
	ContentHash string
	Model       string
	Chunks      int
}

// ChunkRepository es el puerto de persistencia de los fragmentos.
type ChunkRepository interface {
	// ReplacePostChunks borra los fragmentos del post y guarda los nuevos.
	ReplacePostChunks(ctx context.Context, postID string, chunks []Chunk) error
	// DeletePostChunks borra los fragmentos del post. No es un error si no
	// tenía.
	DeletePostChunks(ctx context.Context, postID string) error
	// ListByModel devuelve todos los fragmentos generados con el modelo, con
	// sus vectores.
	ListByModel(ctx context.Context, model string) ([]Chunk, error)
	// IndexState devuelve cómo está indexado el post, o ErrNotFound si no
	// tiene fragmentos.
	IndexState(ctx context.Context, postID string) (PostIndexState, error)
	// IndexStates devuelve el estado de cada post que tiene fragmentos.
	IndexStates(ctx context.Context) ([]PostIndexState, error)
}

// ContextChunk es un fragmento recuperado para el prompt, con su similitud.
type ContextChunk struct {
	PostID    string
	Slug      string
	PostTitle string
	Section   string
	Text      string
	Score     float64
}

// InternalLink es un link sugerido a un post recuperado.
type InternalLink struct {
	Slug   string
	Reason string
}

// Contradiction es una diferencia entre el borrador y un post recuperado.
type Contradiction struct {
	Slug string
	Note string
}

// ContextualSuggestion es la sugerencia de «mejorar con contexto», sin
// validar: el texto es no confiable y se sanitiza al renderizar.
type ContextualSuggestion struct {
	// Suggestion son las mejoras sugeridas, en Markdown.
	Suggestion     string
	InternalLinks  []InternalLink
	Contradictions []Contradiction
	Usage          AssistantUsage
}
