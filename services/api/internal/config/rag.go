package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Valores por defecto del RAG (ADR-027).
const (
	// defaultRAGEmbeddingModel es GA desde el 22 de abril de 2026 y está en
	// el plan gratuito de Gemini.
	defaultRAGEmbeddingModel = "gemini-embedding-2"
	// defaultRAGMinScore sale de make api-rag-eval con gemini-embedding-2
	// (BLOG-155): con 0.60 las 11 consultas siguen encontrando su post con
	// margen (el más bajo fue 0.696). Se vuelve a medir con posts reales
	// (BLOG-156).
	defaultRAGMinScore          = 0.60
	defaultRAGChunkMaxChars     = 800
	defaultRAGTimeoutSeconds    = 10
	defaultRAGIndexTimeoutSecs  = 30
	defaultRAGReindexTimeoutSec = 120
)

// RAG es la configuración del RAG sobre los posts publicados (ADR-027).
type RAG struct {
	// Enabled es false por defecto. Con false, «mejorar con contexto» y el
	// reindexado responden 503 y nada se indexa.
	Enabled        bool
	EmbeddingModel string
	// MinScore es la similitud coseno mínima, entre 0 y 1.
	MinScore      float64
	ChunkMaxChars int
	// EmbedTimeout limita cada llamada al proveedor de embeddings.
	EmbedTimeout time.Duration
	// IndexTimeout limita la indexación en segundo plano de un post.
	IndexTimeout time.Duration
	// ReindexTimeout limita el reindexado completo.
	ReindexTimeout time.Duration
	// GeminiAPIKey es la misma key del asistente (GEMINI_API_KEY).
	GeminiAPIKey Secret
}

// loadRAG lee RAG_ENABLED, RAG_EMBEDDING_MODEL, RAG_MIN_SCORE,
// RAG_CHUNK_MAX_CHARS, RAG_TIMEOUT_SECONDS, RAG_INDEX_TIMEOUT_SECONDS y
// RAG_REINDEX_TIMEOUT_SECONDS. Encendido sin el asistente, la API no arranca
// (ADR-027, punto 11): la generación es una operación del asistente.
func loadRAG(assistant Assistant) (RAG, error) {
	enabled, err := loadBool("RAG_ENABLED")
	if err != nil {
		return RAG{}, err
	}

	minScore, err := loadUnitFloat("RAG_MIN_SCORE", defaultRAGMinScore)
	if err != nil {
		return RAG{}, err
	}

	chunkMaxChars, err := positiveInt("RAG_CHUNK_MAX_CHARS", defaultRAGChunkMaxChars)
	if err != nil {
		return RAG{}, err
	}

	timeouts := make([]time.Duration, 3)
	for i, spec := range []struct {
		key      string
		fallback int
	}{
		{"RAG_TIMEOUT_SECONDS", defaultRAGTimeoutSeconds},
		{"RAG_INDEX_TIMEOUT_SECONDS", defaultRAGIndexTimeoutSecs},
		{"RAG_REINDEX_TIMEOUT_SECONDS", defaultRAGReindexTimeoutSec},
	} {
		seconds, err := positiveInt(spec.key, spec.fallback)
		if err != nil {
			return RAG{}, err
		}

		timeouts[i] = time.Duration(seconds) * time.Second
	}

	model := strings.TrimSpace(os.Getenv("RAG_EMBEDDING_MODEL"))
	if model == "" {
		model = defaultRAGEmbeddingModel
	}

	rag := RAG{
		Enabled:        enabled,
		EmbeddingModel: model,
		MinScore:       minScore,
		ChunkMaxChars:  chunkMaxChars,
		EmbedTimeout:   timeouts[0],
		IndexTimeout:   timeouts[1],
		ReindexTimeout: timeouts[2],
		GeminiAPIKey:   assistant.GeminiAPIKey,
	}

	if enabled && !assistant.Enabled {
		return RAG{}, fmt.Errorf("RAG_ENABLED is true but the writing assistant is disabled: set ASSISTANT_ENABLED=true")
	}

	return rag, nil
}

// loadUnitFloat lee un número entre 0 y 1; vacía es el valor por defecto.
func loadUnitFloat(key string, fallback float64) (float64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	number, err := strconv.ParseFloat(value, 64)
	if err != nil || number < 0 || number > 1 {
		return 0, fmt.Errorf("invalid %s %q: must be a number between 0 and 1", key, os.Getenv(key))
	}

	return number, nil
}
