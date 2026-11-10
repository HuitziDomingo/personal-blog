package config

import (
	"bytes"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Key de mentira para comprobar que no aparece en errores ni en logs.
const fakeGeminiKey = "AIza-fake-key-for-tests"

func TestLoadAssistantIsDisabledByDefault(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.False(t, cfg.Assistant.Enabled)
	assert.Equal(t, 30*time.Second, cfg.Assistant.Timeout)
}

func TestLoadAssistantEnabled(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("ASSISTANT_ENABLED", "true")
	t.Setenv("GEMINI_API_KEY", fakeGeminiKey)
	t.Setenv("GEMINI_MODEL", " gemini-test ")
	t.Setenv("ASSISTANT_TIMEOUT_SECONDS", "12")

	cfg, err := Load()

	require.NoError(t, err)
	assert.True(t, cfg.Assistant.Enabled)
	assert.Equal(t, fakeGeminiKey, cfg.Assistant.GeminiAPIKey.Reveal())
	assert.Equal(t, "gemini-test", cfg.Assistant.GeminiModel)
	assert.Equal(t, 12*time.Second, cfg.Assistant.Timeout)
}

// Falla cerrado (ADR-021, punto 8): encendido sin key o sin modelo no arranca.
func TestLoadAssistantEnabledWithoutKeyOrModelFails(t *testing.T) {
	t.Run("sin key", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("ASSISTANT_ENABLED", "true")
		t.Setenv("GEMINI_MODEL", "gemini-test")

		_, err := Load()

		require.EqualError(t, err, "ASSISTANT_ENABLED is true but GEMINI_API_KEY is empty")
	})

	t.Run("sin modelo", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("ASSISTANT_ENABLED", "true")
		t.Setenv("GEMINI_API_KEY", fakeGeminiKey)

		_, err := Load()

		require.ErrorContains(t, err, "GEMINI_MODEL is empty")
		assert.NotContains(t, err.Error(), fakeGeminiKey)
	})
}

func TestLoadRejectsInvalidAssistantSettings(t *testing.T) {
	for key, value := range map[string]string{
		"ASSISTANT_ENABLED":         "yes",
		"ASSISTANT_TIMEOUT_SECONDS": "0",
	} {
		t.Run(key, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(key, value)

			_, err := Load()

			require.ErrorContains(t, err, "invalid "+key)
		})
	}
}

func TestSecretIsRedactedInFmtAndSlog(t *testing.T) {
	cfg := Assistant{GeminiAPIKey: Secret(fakeGeminiKey)}

	var logs bytes.Buffer
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("config", "assistant", cfg, "key", cfg.GeminiAPIKey)

	for _, printed := range []string{
		fmt.Sprintf("%v", cfg), fmt.Sprintf("%+v", cfg), fmt.Sprintf("%#v", cfg),
		fmt.Sprint(cfg.GeminiAPIKey), logs.String(),
	} {
		assert.NotContains(t, printed, fakeGeminiKey)
	}
	assert.Contains(t, logs.String(), "[REDACTED]")
	assert.Empty(t, Secret("").String())
}

func TestWarningsWhenTheKeyIsSetButTheAssistantIsDisabled(t *testing.T) {
	cfg := usefulConfig()
	cfg.Assistant.GeminiAPIKey = Secret(fakeGeminiKey)

	warnings := cfg.Warnings()

	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "ASSISTANT_ENABLED is not true")
	assert.NotContains(t, warnings[0], fakeGeminiKey)

	cfg.Assistant.Enabled = true
	assert.Empty(t, cfg.Warnings())
}
