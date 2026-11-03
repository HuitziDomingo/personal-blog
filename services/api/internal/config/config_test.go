package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("MONGO_URI", "mongodb://localhost:27017")
	t.Setenv("MONGO_DB_NAME", "blog_test")
}

func TestLoadReadsMongoConfig(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "mongodb://localhost:27017", cfg.MongoURI)
	assert.Equal(t, "blog_test", cfg.MongoDBName)
}

func TestLoadReadsOptionalInitialAdmin(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("INITIAL_ADMIN_EMAIL", "admin@huitzi.xyz")
	t.Setenv("INITIAL_ADMIN_PASSWORD", "correct-horse-battery")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "admin@huitzi.xyz", cfg.InitialAdminEmail)
	assert.Equal(t, "correct-horse-battery", cfg.InitialAdminPassword)
}

func TestLoadAllowsMissingInitialAdmin(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("INITIAL_ADMIN_EMAIL", "")
	t.Setenv("INITIAL_ADMIN_PASSWORD", "")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Empty(t, cfg.InitialAdminEmail)
	assert.Empty(t, cfg.InitialAdminPassword)
}

func TestLoadParsesAllowedOrigins(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("ALLOWED_ORIGINS", " https://huitzi.xyz, ,http://localhost:4200 ")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, []string{"https://huitzi.xyz", "http://localhost:4200"}, cfg.AllowedOrigins)
}

func TestLoadRejectsInvalidAllowedOrigins(t *testing.T) {
	for _, origin := range []string{"*", "https://*.huitzi.xyz", "https://huitzi.xyz/", "https://huitzi.xyz/admin", "huitzi.xyz", "ftp://huitzi.xyz"} {
		t.Run(origin, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv("ALLOWED_ORIGINS", origin)

			_, err := Load()

			require.ErrorContains(t, err, "invalid ALLOWED_ORIGINS")
		})
	}
}

func TestLoadMaxBodyBytes(t *testing.T) {
	setRequiredEnv(t)

	t.Setenv("MAX_BODY_BYTES", "")
	cfg, err := Load()
	require.NoError(t, err)
	assert.EqualValues(t, 1048576, cfg.MaxBodyBytes)

	t.Setenv("MAX_BODY_BYTES", "2048")
	cfg, err = Load()
	require.NoError(t, err)
	assert.EqualValues(t, 2048, cfg.MaxBodyBytes)
}

func TestLoadRejectsInvalidMaxBodyBytes(t *testing.T) {
	for _, value := range []string{"0", "-1", "abc"} {
		t.Run(value, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv("MAX_BODY_BYTES", value)

			_, err := Load()

			require.ErrorContains(t, err, "invalid MAX_BODY_BYTES")
		})
	}
}

func TestLoadFailsWhenRequiredVariableIsMissing(t *testing.T) {
	for _, key := range []string{"MONGO_URI", "MONGO_DB_NAME"} {
		t.Run(key, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(key, "")

			_, err := Load()

			require.ErrorContains(t, err, "missing required environment variable "+key)
		})
	}
}

func TestLoadUsesDefaultPortWhenUnset(t *testing.T) {
	setRequiredEnv(t)
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
			setRequiredEnv(t)
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
			setRequiredEnv(t)
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
