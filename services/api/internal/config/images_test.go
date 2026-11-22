package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Token de mentira para comprobar que no aparece en errores ni en avisos.
const (
	fakeCloudflareAI      = "cf-fake-token-for-tests"
	fakeCloudflareAccount = "0123456789abcdef0123456789abcdef"
)

func setImagesEnv(t *testing.T) {
	t.Helper()

	setRequiredEnv(t)
	t.Setenv("ASSISTANT_ENABLED", "true")
	t.Setenv("GEMINI_API_KEY", fakeGeminiKey)
	t.Setenv("GEMINI_MODEL", "gemini-test")
	t.Setenv("IMAGES_ENABLED", "true")
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", fakeCloudflareAccount)
	t.Setenv("CLOUDFLARE_AI_TOKEN", fakeCloudflareAI)
	t.Setenv("FILES_STORE", "gcs")
	t.Setenv("FILES_GCS_BUCKET", "huitzi-files-test")
}

func TestLoadImagesIsDisabledByDefault(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.False(t, cfg.Images.Enabled)
	assert.Equal(t, 30*time.Second, cfg.Images.Timeout)
	assert.Equal(t, RateLimit{PerMinute: 2, Burst: 2}, cfg.ImagesRateLimit)
	assert.Equal(t, 20, cfg.ImagesPerDay)
}

func TestLoadImagesEnabled(t *testing.T) {
	setImagesEnv(t)
	t.Setenv("IMAGES_TIMEOUT_SECONDS", "15")
	t.Setenv("RATE_LIMIT_IMAGES_PER_MINUTE", "1")
	t.Setenv("RATE_LIMIT_IMAGES_BURST", "1")
	t.Setenv("RATE_LIMIT_IMAGES_PER_DAY", "5")

	cfg, err := Load()

	require.NoError(t, err)
	assert.True(t, cfg.Images.Enabled)
	assert.Equal(t, fakeCloudflareAccount, cfg.Images.CloudflareAccountID)
	assert.Equal(t, fakeCloudflareAI, cfg.Images.CloudflareAIToken.Reveal())
	assert.Equal(t, "huitzi-files-test", cfg.Files.GCSBucket)
	assert.Equal(t, 15*time.Second, cfg.Images.Timeout)
	assert.Equal(t, RateLimit{PerMinute: 1, Burst: 1}, cfg.ImagesRateLimit)
	assert.Equal(t, 5, cfg.ImagesPerDay)
}

func TestLoadImagesWithTheLocalFileStore(t *testing.T) {
	setImagesEnv(t)
	t.Setenv("FILES_STORE", "local")
	t.Setenv("FILES_GCS_BUCKET", "")
	t.Setenv("FILES_LOCAL_DIR", "/tmp/files")
	t.Setenv("FILES_LOCAL_BASE_URL", "http://localhost:8080/media")

	cfg, err := Load()

	require.NoError(t, err)
	assert.True(t, cfg.Images.Enabled)
	assert.Equal(t, FilesStoreLocal, cfg.Files.Store)
}

// Falla cerrado (ADR-026, punto 10): encendida sin cuenta, token, bucket o
// asistente, la API no arranca.
func TestLoadImagesEnabledWithoutEverythingFails(t *testing.T) {
	for _, tt := range []struct {
		key, value, want string
	}{
		{"CLOUDFLARE_ACCOUNT_ID", "", "IMAGES_ENABLED is true but CLOUDFLARE_ACCOUNT_ID is empty"},
		{"CLOUDFLARE_AI_TOKEN", "", "IMAGES_ENABLED is true but CLOUDFLARE_AI_TOKEN is empty"},
		{"FILES_STORE", "", "IMAGES_ENABLED is true but FILES_STORE is empty: set FILES_STORE=gcs with FILES_GCS_BUCKET, or FILES_STORE=local for development"},
		{"ASSISTANT_ENABLED", "false", "IMAGES_ENABLED is true but ASSISTANT_ENABLED is not: the cover subject comes from the writing assistant"},
	} {
		t.Run(tt.key, func(t *testing.T) {
			setImagesEnv(t)
			t.Setenv(tt.key, tt.value)

			_, err := Load()

			require.EqualError(t, err, tt.want)
			assert.NotContains(t, err.Error(), fakeCloudflareAI)
		})
	}
}

func TestLoadRejectsInvalidImagesSettings(t *testing.T) {
	for _, tt := range []struct{ key, value string }{
		{"IMAGES_ENABLED", "yes"},
		{"IMAGES_TIMEOUT_SECONDS", "0"},
		{"RATE_LIMIT_IMAGES_PER_MINUTE", "0"},
		{"RATE_LIMIT_IMAGES_PER_DAY", "-1"},
	} {
		t.Run(tt.key+"="+tt.value, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.value)

			_, err := Load()

			require.ErrorContains(t, err, tt.key)
		})
	}
}

func TestImagesWarnings(t *testing.T) {
	t.Run("token sin activar", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("CLOUDFLARE_AI_TOKEN", fakeCloudflareAI)

		cfg, err := Load()
		require.NoError(t, err)

		assert.Contains(t, cfg.Warnings(), "CLOUDFLARE_AI_TOKEN is set but IMAGES_ENABLED is not true: cover generation responds 503 and the token is not used")
		for _, warning := range cfg.Warnings() {
			assert.NotContains(t, warning, fakeCloudflareAI)
		}
	})
}
