package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadRAGIsDisabledByDefault(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, RAG{
		EmbeddingModel: "gemini-embedding-2",
		MinScore:       0.65,
		ChunkMaxChars:  800,
		EmbedTimeout:   10 * time.Second,
		IndexTimeout:   30 * time.Second,
		ReindexTimeout: 120 * time.Second,
	}, cfg.RAG)
}

func TestLoadRAGEnabled(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("ASSISTANT_ENABLED", "true")
	t.Setenv("GEMINI_API_KEY", fakeGeminiKey)
	t.Setenv("GEMINI_MODEL", "gemini-test")
	t.Setenv("RAG_ENABLED", "true")
	t.Setenv("RAG_EMBEDDING_MODEL", " gemini-embedding-001 ")
	t.Setenv("RAG_MIN_SCORE", "0.7")
	t.Setenv("RAG_CHUNK_MAX_CHARS", "600")
	t.Setenv("RAG_TIMEOUT_SECONDS", "5")
	t.Setenv("RAG_INDEX_TIMEOUT_SECONDS", "20")
	t.Setenv("RAG_REINDEX_TIMEOUT_SECONDS", "300")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, RAG{
		Enabled:        true,
		EmbeddingModel: "gemini-embedding-001",
		MinScore:       0.7,
		ChunkMaxChars:  600,
		EmbedTimeout:   5 * time.Second,
		IndexTimeout:   20 * time.Second,
		ReindexTimeout: 300 * time.Second,
		GeminiAPIKey:   Secret(fakeGeminiKey),
	}, cfg.RAG)
}

// Encendido sin el asistente, la API no arranca (ADR-027, punto 11).
func TestLoadRAGRequiresTheAssistant(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("RAG_ENABLED", "true")

	_, err := Load()

	require.ErrorContains(t, err, "ASSISTANT_ENABLED=true")
}

func TestLoadRAGRejectsInvalidValues(t *testing.T) {
	for key, value := range map[string]string{
		"RAG_ENABLED":                 "yes",
		"RAG_MIN_SCORE":               "1.5",
		"RAG_CHUNK_MAX_CHARS":         "0",
		"RAG_TIMEOUT_SECONDS":         "-1",
		"RAG_INDEX_TIMEOUT_SECONDS":   "x",
		"RAG_REINDEX_TIMEOUT_SECONDS": "0",
	} {
		t.Run(key, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(key, value)

			_, err := Load()

			require.ErrorContains(t, err, key)
		})
	}
}

func TestLoadRAGMinScoreRejectsNotANumber(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("RAG_MIN_SCORE", "alto")

	_, err := Load()

	require.ErrorContains(t, err, "RAG_MIN_SCORE")
}
