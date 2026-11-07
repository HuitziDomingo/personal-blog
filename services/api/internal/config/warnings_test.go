package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// usefulConfig es una configuración sin avisos.
func usefulConfig() Config {
	return Config{
		AllowedOrigins: []string{"http://localhost:4200"},
		MaxBodyBytes:   defaultMaxBodyBytes,
		LogFormat:      LogFormatText,
		GinMode:        GinModeDebug,
	}
}

func TestWarningsEmptyForAUsefulConfig(t *testing.T) {
	assert.Empty(t, usefulConfig().Warnings())
}

func TestWarningsWhenAllowedOriginsIsEmpty(t *testing.T) {
	cfg := usefulConfig()
	cfg.AllowedOrigins = nil

	warnings := cfg.Warnings()

	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "ALLOWED_ORIGINS is empty")
	assert.Contains(t, warnings[0], "no browser can log in or change state")
}

func TestWarningsWhenOnlyHalfOfTheInitialAdminIsSet(t *testing.T) {
	const email = "admin@huitzi.xyz"
	const password = "correct-horse-battery"

	cfg := usefulConfig()
	cfg.InitialAdminEmail = email
	warnings := cfg.Warnings()
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "INITIAL_ADMIN_PASSWORD is empty")
	assert.NotContains(t, warnings[0], email)

	cfg = usefulConfig()
	cfg.InitialAdminPassword = password
	warnings = cfg.Warnings()
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "INITIAL_ADMIN_EMAIL is empty")
	assert.NotContains(t, warnings[0], password)

	cfg.InitialAdminEmail = email
	assert.Empty(t, cfg.Warnings())
}

func TestWarningsWhenMaxBodyBytesIsTooSmallForPosts(t *testing.T) {
	cfg := usefulConfig()
	cfg.MaxBodyBytes = 4096

	warnings := cfg.Warnings()

	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "MAX_BODY_BYTES is 4096 bytes")

	cfg.MaxBodyBytes = minUsefulBodyBytes
	assert.Empty(t, cfg.Warnings())
}

func TestWarningsWhenReleaseModeHasNoTrustedProxies(t *testing.T) {
	cfg := usefulConfig()
	cfg.GinMode = GinModeRelease

	warnings := cfg.Warnings()

	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "TRUSTED_PROXIES is empty in release mode")

	cfg.TrustedProxies = []string{"169.254.1.1"}
	assert.Empty(t, cfg.Warnings())
}

func TestWarningsWhenJSONLogsRunGinInDebugMode(t *testing.T) {
	cfg := usefulConfig()
	cfg.LogFormat = LogFormatJSON

	warnings := cfg.Warnings()

	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "GIN_MODE=debug with LOG_FORMAT=json")
}

func TestWarningsNeverIncludeSecrets(t *testing.T) {
	// Credenciales de mentira para comprobar que no aparecen en los avisos.
	mongoURI := "mongodb://user:" + "mongo-secret" + "@db:27017"
	cfg := Config{
		MongoURI:             mongoURI,
		JWTSecret:            []byte(testJWTSecret),
		InitialAdminPassword: "correct-horse-battery",
		MaxBodyBytes:         1,
		LogFormat:            LogFormatJSON,
		GinMode:              GinModeDebug,
	}

	all := strings.Join(cfg.Warnings(), "\n")

	assert.NotEmpty(t, all)
	for _, secret := range []string{"mongo-secret", testJWTSecret, "correct-horse-battery"} {
		assert.NotContains(t, all, secret)
	}
}

func TestLoadLogFormat(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, LogFormatText, cfg.LogFormat)

	t.Setenv("LOG_FORMAT", "json")
	cfg, err = Load()
	require.NoError(t, err)
	assert.Equal(t, LogFormatJSON, cfg.LogFormat)

	t.Setenv("LOG_FORMAT", "yaml")
	_, err = Load()
	require.EqualError(t, err, `invalid LOG_FORMAT "yaml": must be text or json`)
}

func TestLoadGinModeDefaultsFromTheLogFormat(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("GIN_MODE", "")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, GinModeDebug, cfg.GinMode)
	assert.False(t, cfg.GinModeExplicit)

	t.Setenv("LOG_FORMAT", "json")
	cfg, err = Load()
	require.NoError(t, err)
	assert.Equal(t, GinModeRelease, cfg.GinMode)

	t.Setenv("GIN_MODE", "debug")
	cfg, err = Load()
	require.NoError(t, err)
	assert.Equal(t, GinModeDebug, cfg.GinMode)
	assert.True(t, cfg.GinModeExplicit)

	t.Setenv("GIN_MODE", "prod")
	_, err = Load()
	require.EqualError(t, err, `invalid GIN_MODE "prod": must be debug, release or test`)
}
