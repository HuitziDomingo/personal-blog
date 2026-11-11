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
	t.Setenv("JWT_SECRET", testJWTSecret)
	// Que los tests no dependan de lo exportado en el shell (por ejemplo, tras
	// cargar un .env).
	t.Setenv("LOG_FORMAT", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("ASSISTANT_ENABLED", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("GEMINI_MODEL", "")
	t.Setenv("ASSISTANT_TIMEOUT_SECONDS", "")
	t.Setenv("ASSISTANT_THINKING_LEVEL", "")
	t.Setenv("ASSISTANT_MAX_OUTPUT_TOKENS", "")
}

const testJWTSecret = "0123456789abcdef0123456789abcdef"

func TestLoadReadsJWTSecret(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, []byte(testJWTSecret), cfg.JWTSecret)
}

func TestLoadRejectsShortJWTSecret(t *testing.T) {
	setRequiredEnv(t)
	short := testJWTSecret[:MinJWTSecretBytes-1]
	t.Setenv("JWT_SECRET", short)

	_, err := Load()

	require.EqualError(t, err, "invalid JWT_SECRET: must be at least 32 bytes")
	assert.NotContains(t, err.Error(), short)
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

func TestLoadRateLimitDefaults(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, RateLimit{PerMinute: 60, Burst: 20}, cfg.GlobalRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 5, Burst: 5}, cfg.LoginRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 10, Burst: 10}, cfg.RefreshRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 120, Burst: 60}, cfg.PreflightRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 300, Burst: 100}, cfg.UserRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 5, Burst: 5}, cfg.AssistantRateLimit)
	assert.Empty(t, cfg.TrustedProxies)
}

func TestLoadRateLimitOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("RATE_LIMIT_GLOBAL_PER_MINUTE", "120")
	t.Setenv("RATE_LIMIT_GLOBAL_BURST", "40")
	t.Setenv("RATE_LIMIT_LOGIN_PER_MINUTE", "3")
	t.Setenv("RATE_LIMIT_LOGIN_BURST", "2")
	t.Setenv("RATE_LIMIT_REFRESH_PER_MINUTE", "20")
	t.Setenv("RATE_LIMIT_REFRESH_BURST", "4")
	t.Setenv("RATE_LIMIT_PREFLIGHT_PER_MINUTE", "30")
	t.Setenv("RATE_LIMIT_PREFLIGHT_BURST", "6")
	t.Setenv("RATE_LIMIT_USER_PER_MINUTE", "500")
	t.Setenv("RATE_LIMIT_USER_BURST", "50")
	t.Setenv("RATE_LIMIT_ASSISTANT_PER_MINUTE", "2")
	t.Setenv("RATE_LIMIT_ASSISTANT_BURST", "1")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, RateLimit{PerMinute: 120, Burst: 40}, cfg.GlobalRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 3, Burst: 2}, cfg.LoginRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 20, Burst: 4}, cfg.RefreshRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 30, Burst: 6}, cfg.PreflightRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 500, Burst: 50}, cfg.UserRateLimit)
	assert.Equal(t, RateLimit{PerMinute: 2, Burst: 1}, cfg.AssistantRateLimit)
}

func TestLoadRejectsInvalidRateLimits(t *testing.T) {
	for _, key := range []string{
		"RATE_LIMIT_GLOBAL_PER_MINUTE", "RATE_LIMIT_LOGIN_BURST", "RATE_LIMIT_REFRESH_PER_MINUTE",
		"RATE_LIMIT_PREFLIGHT_BURST", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_ASSISTANT_PER_MINUTE",
	} {
		for _, value := range []string{"0", "-5", "many"} {
			t.Run(key+"="+value, func(t *testing.T) {
				setRequiredEnv(t)
				t.Setenv(key, value)

				_, err := Load()

				require.ErrorContains(t, err, "invalid "+key)
			})
		}
	}
}

func TestLoadTrustedProxies(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("TRUSTED_PROXIES", " 169.254.0.0/16, ,10.0.0.1 ")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, []string{"169.254.0.0/16", "10.0.0.1"}, cfg.TrustedProxies)
}

func TestLoadRejectsInvalidTrustedProxies(t *testing.T) {
	for _, proxy := range []string{"0.0.0.0/0", "::/0", "not-an-ip", "10.0.0.0/33"} {
		t.Run(proxy, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv("TRUSTED_PROXIES", proxy)

			_, err := Load()

			require.ErrorContains(t, err, "invalid TRUSTED_PROXIES")
		})
	}
}

func TestLoadFailsWhenRequiredVariableIsMissing(t *testing.T) {
	for _, key := range []string{"MONGO_URI", "MONGO_DB_NAME", "JWT_SECRET"} {
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
