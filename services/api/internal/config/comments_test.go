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
	assert.Equal(t, Comments{Enabled: false, RateLimitMax: 3, RateLimitWindow: 10 * time.Minute}, cfg.Comments)
}

func TestLoadCommentsEnabled(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("COMMENTS_ENABLED", "true")
	t.Setenv("COMMENTS_RATE_LIMIT_MAX", "5")
	t.Setenv("COMMENTS_RATE_LIMIT_WINDOW_MINUTES", "30")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Comments{Enabled: true, RateLimitMax: 5, RateLimitWindow: 30 * time.Minute}, cfg.Comments)
}

func TestLoadCommentsRejectsInvalidValues(t *testing.T) {
	tests := map[string]struct{ key, value, err string }{
		"flag":    {"COMMENTS_ENABLED", "yes", `invalid COMMENTS_ENABLED "yes": must be true or false`},
		"límite":  {"COMMENTS_RATE_LIMIT_MAX", "0", `invalid COMMENTS_RATE_LIMIT_MAX "0": must be a positive number`},
		"ventana": {"COMMENTS_RATE_LIMIT_WINDOW_MINUTES", "-1", `invalid COMMENTS_RATE_LIMIT_WINDOW_MINUTES "-1": must be a positive number`},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.value)

			_, err := Load()

			require.EqualError(t, err, tt.err)
		})
	}
}
