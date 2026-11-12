package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ADR-022, puntos 3 y 10: apagados por defecto, con 3 envíos cada 10 minutos.
func TestLoadCommentsIsDisabledByDefault(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Comments{Enabled: false, RateLimitMax: 3, RateLimitWindow: 10 * time.Minute, ModerationModel: "gemini-3.6-flash", ModerationTimeout: 10 * time.Second, ModerationMaxOutputTokens: 512}, cfg.Comments)
}

func TestLoadCommentsEnabled(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("COMMENTS_ENABLED", "true")
	t.Setenv("COMMENTS_RATE_LIMIT_MAX", "5")
	t.Setenv("COMMENTS_RATE_LIMIT_WINDOW_MINUTES", "30")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Comments{Enabled: true, RateLimitMax: 5, RateLimitWindow: 30 * time.Minute, ModerationModel: "gemini-3.6-flash", ModerationTimeout: 10 * time.Second, ModerationMaxOutputTokens: 512}, cfg.Comments)
}

func TestLoadCommentsRejectsInvalidValues(t *testing.T) {
	tests := map[string]struct{ key, value, err string }{
		"flag":         {"COMMENTS_ENABLED", "yes", `invalid COMMENTS_ENABLED "yes": must be true or false`},
		"límite":       {"COMMENTS_RATE_LIMIT_MAX", "0", `invalid COMMENTS_RATE_LIMIT_MAX "0": must be a positive number`},
		"ventana":      {"COMMENTS_RATE_LIMIT_WINDOW_MINUTES", "-1", `invalid COMMENTS_RATE_LIMIT_WINDOW_MINUTES "-1": must be a positive number`},
		"moderación":   {"COMMENTS_MODERATION_ENABLED", "1", `invalid COMMENTS_MODERATION_ENABLED "1": must be true or false`},
		"timeout":      {"COMMENTS_MODERATION_TIMEOUT_SECONDS", "0", `invalid COMMENTS_MODERATION_TIMEOUT_SECONDS "0": must be a positive number`},
		"salida 0":     {"COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", "0", `invalid COMMENTS_MODERATION_MAX_OUTPUT_TOKENS`},
		"salida -1":    {"COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", "-1", `invalid COMMENTS_MODERATION_MAX_OUTPUT_TOKENS`},
		"salida int32": {"COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", "4294967296", `invalid COMMENTS_MODERATION_MAX_OUTPUT_TOKENS`},
		"salida texto": {"COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", "mucho", `invalid COMMENTS_MODERATION_MAX_OUTPUT_TOKENS`},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.value)

			_, err := Load()

			require.ErrorContains(t, err, tt.err)
		})
	}
}

// ADR-022, punto 10: la moderación con LLM se enciende aparte, con la misma
// key del asistente. Su modelo es gemini-3.6-flash salvo que se indique otro,
// aunque GEMINI_MODEL diga otra cosa, y tiene su propio límite de salida.
func TestLoadCommentModeration(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("COMMENTS_MODERATION_ENABLED", "true")
	t.Setenv("GEMINI_API_KEY", "AIza-test")
	t.Setenv("GEMINI_MODEL", "gemini-3.8-flash")
	t.Setenv("ASSISTANT_MAX_OUTPUT_TOKENS", "4096")

	cfg, err := Load()

	require.NoError(t, err)
	assert.True(t, cfg.Comments.ModerationEnabled)
	assert.Equal(t, "gemini-3.6-flash", cfg.Comments.ModerationModel, "no cae al modelo del asistente")
	assert.Equal(t, 10*time.Second, cfg.Comments.ModerationTimeout)
	assert.Equal(t, int32(512), cfg.Comments.ModerationMaxOutputTokens, "no usa el límite del asistente")
	assert.Equal(t, "AIza-test", cfg.Comments.GeminiAPIKey.Reveal())
	assert.False(t, cfg.Assistant.Enabled, "la moderación no enciende el asistente")

	t.Setenv("COMMENTS_MODERATION_MODEL", " gemini-test ")
	t.Setenv("COMMENTS_MODERATION_TIMEOUT_SECONDS", "5")
	t.Setenv("COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", "1024")

	cfg, err = Load()

	require.NoError(t, err)
	assert.Equal(t, "gemini-test", cfg.Comments.ModerationModel)
	assert.Equal(t, 5*time.Second, cfg.Comments.ModerationTimeout)
	assert.Equal(t, int32(1024), cfg.Comments.ModerationMaxOutputTokens)
}

// Encendida sin key, la API no arranca. Sin modelo, usa el de por defecto.
func TestLoadCommentModerationFailsClosed(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("COMMENTS_MODERATION_ENABLED", "true")

	_, err := Load()
	require.EqualError(t, err, "COMMENTS_MODERATION_ENABLED is true but GEMINI_API_KEY is empty")
}
