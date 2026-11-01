package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadUsesDefaultPortWhenUnset(t *testing.T) {
	t.Setenv("PORT", "")
	require.NoError(t, os.Unsetenv("PORT"))

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "8080", cfg.Port)
}

func TestLoadPort(t *testing.T) {
	tests := []struct {
		name string
		port string
		want string
	}{
		{name: "empty uses default", port: "", want: "8080"},
		{name: "custom port", port: "3000", want: "3000"},
		{name: "highest port", port: "65535", want: "65535"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PORT", tt.port)

			cfg, err := Load()

			require.NoError(t, err)
			assert.Equal(t, tt.want, cfg.Port)
		})
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	for _, port := range []string{"abc", "0", "-1", "65536"} {
		t.Run(port, func(t *testing.T) {
			t.Setenv("PORT", port)

			_, err := Load()

			require.ErrorContains(t, err, "invalid PORT")
		})
	}
}

func TestRequired(t *testing.T) {
	t.Setenv("REQUIRED_VAR", "value")

	value, err := required("REQUIRED_VAR")

	require.NoError(t, err)
	assert.Equal(t, "value", value)
}

func TestRequiredFailsWhenMissingOrEmpty(t *testing.T) {
	t.Setenv("REQUIRED_VAR", "")

	_, err := required("REQUIRED_VAR")
	require.ErrorContains(t, err, "missing required environment variable REQUIRED_VAR")

	require.NoError(t, os.Unsetenv("REQUIRED_VAR"))

	_, err = required("REQUIRED_VAR")
	require.ErrorContains(t, err, "missing required environment variable REQUIRED_VAR")
}
