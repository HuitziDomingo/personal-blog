package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	bucketsSecret  = "rate-limit-test-secret-of-32-bytes!!"
	issuerClaim    = "huitzi.xyz/api"
	audienceClaim  = "huitzi.xyz/admin"
	otherClientKey = "198.51.100.20"
)

func rejectAllTokens(string) (service.AccessClaims, error) {
	return service.AccessClaims{}, domain.ErrInvalidToken
}

func withAccessCookie(token string) map[string]string {
	return map[string]string{"Cookie": accessCookieName + "=" + token}
}

func preflightHeaders(origin string) map[string]string {
	headers := map[string]string{"Access-Control-Request-Method": http.MethodPost}
	if origin != "" {
		headers["Origin"] = origin
	}

	return headers
}

// signed firma unos claims arbitrarios, para fabricar tokens que TokenService
// nunca emitiría.
func signed(t *testing.T, method jwt.SigningMethod, key any, claims jwt.MapClaims) string {
	t.Helper()

	token, err := jwt.NewWithClaims(method, claims).SignedString(key)
	require.NoError(t, err)

	return token
}

// El rate limiter valida con el TokenService real, no con un fake: lo que se
// prueba es que cada regla de ADR-011 que rechaza el token también le niega el
// bucket de usuario.
func TestInvalidAccessTokensNeverUseTheUserBucket(t *testing.T) {
	clock := newFakeClock()
	tokens, err := service.NewTokenService([]byte(bucketsSecret), nil, nil, clock.Now)
	require.NoError(t, err)

	valid, err := tokens.IssueAccess(testUser)
	require.NoError(t, err)

	now := clock.Now()
	claims := func(changes jwt.MapClaims) jwt.MapClaims {
		base := jwt.MapClaims{
			"sub":  testUser.ID,
			"role": string(testUser.Role),
			"iss":  issuerClaim,
			"aud":  []string{audienceClaim},
			"iat":  now.Unix(),
			"exp":  now.Add(service.AccessTokenTTL).Unix(),
		}
		for name, value := range changes {
			if value == nil {
				delete(base, name)
			} else {
				base[name] = value
			}
		}

		return base
	}

	hs256 := jwt.SigningMethodHS256
	secret := []byte(bucketsSecret)
	_, err = tokens.ParseAccess(signed(t, hs256, secret, claims(nil)))
	require.NoError(t, err, "the crafted claims are valid before each change")

	invalid := map[string]func() string{
		"other audience": func() string {
			return signed(t, hs256, secret, claims(jwt.MapClaims{"aud": []string{"huitzi.xyz/web"}}))
		},
		"other issuer": func() string { return signed(t, hs256, secret, claims(jwt.MapClaims{"iss": "evil.example"})) },
		"without exp":  func() string { return signed(t, hs256, secret, claims(jwt.MapClaims{"exp": nil})) },
		"issued later": func() string {
			return signed(t, hs256, secret, claims(jwt.MapClaims{"iat": now.Add(time.Hour).Unix()}))
		},
		"other secret":    func() string { return signed(t, hs256, []byte("another-secret-that-is-32-bytes!!!"), claims(nil)) },
		"alg none":        func() string { return signed(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, claims(nil)) },
		"HS512":           func() string { return signed(t, jwt.SigningMethodHS512, secret, claims(nil)) },
		"without subject": func() string { return signed(t, hs256, secret, claims(jwt.MapClaims{"sub": nil})) },
		"garbage":         func() string { return "not-a-jwt" },
		"empty":           func() string { return "" },
	}

	// Cada caso: ráfaga global de 1 y de usuario de 100. Con un token que diera
	// el bucket de usuario, la segunda petición pasaría.
	run := func(token string, wait time.Duration) (*rateLimiter, []int) {
		limiter := newRateLimiter(RateLimits{
			Global:    RateLimit{PerMinute: 1, Burst: 1},
			Login:     RateLimit{PerMinute: 1, Burst: 1},
			Refresh:   RateLimit{PerMinute: 1, Burst: 1},
			Preflight: RateLimit{PerMinute: 1, Burst: 1},
			User:      RateLimit{PerMinute: 60, Burst: 100},
		}, tokens.ParseAccess, clock.Now)
		router := gin.New()
		router.Use(limiter.handle)
		router.GET("/api/v1/posts", func(c *gin.Context) { c.Status(http.StatusOK) })

		clock.advance(wait)

		codes := make([]int, 0, 3)
		for range 3 {
			codes = append(codes, send(router, http.MethodGet, "/api/v1/posts", "", withAccessCookie(token)).Code)
		}

		return limiter, codes
	}

	t.Run("valid token is the control", func(t *testing.T) {
		limiter, codes := run(valid, 0)

		assert.Equal(t, []int{http.StatusOK, http.StatusOK, http.StatusOK}, codes)
		assert.Equal(t, 1, limiter.users.size())
		assert.Zero(t, limiter.global.size())
	})

	for name, token := range invalid {
		t.Run(name, func(t *testing.T) {
			limiter, codes := run(token(), 0)

			assert.Equal(t, []int{http.StatusOK, http.StatusTooManyRequests, http.StatusTooManyRequests}, codes)
			assert.Zero(t, limiter.users.size(), "the user bucket is never created")
			assert.Equal(t, 1, limiter.global.size())
		})
	}

	// Va al final: adelanta el reloj compartido.
	t.Run("expired", func(t *testing.T) {
		limiter, codes := run(valid, service.AccessTokenTTL+time.Second)

		assert.Equal(t, []int{http.StatusOK, http.StatusTooManyRequests, http.StatusTooManyRequests}, codes)
		assert.Zero(t, limiter.users.size())
		assert.Equal(t, 1, limiter.global.size())
	})
}

func bucketsRouter(t *testing.T, limits RateLimits) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	generous := cfg.RateLimits.Global
	cfg.RateLimits = RateLimits{Global: generous, Login: generous, Refresh: generous, Preflight: generous, User: generous}
	for _, change := range []struct {
		value  RateLimit
		target *RateLimit
	}{
		{limits.Global, &cfg.RateLimits.Global},
		{limits.Preflight, &cfg.RateLimits.Preflight},
		{limits.User, &cfg.RateLimits.User},
	} {
		if change.value != (RateLimit{}) {
			*change.target = change.value
		}
	}

	return newTestRouterWith(t, cfg)
}

func TestAuthenticatedRequestsUseTheUserBucket(t *testing.T) {
	router := bucketsRouter(t, RateLimits{
		Global: RateLimit{PerMinute: 1, Burst: 1},
		User:   RateLimit{PerMinute: 60, Burst: 3},
	})

	for range 3 {
		assert.Equal(t, http.StatusOK, send(router, http.MethodGet, "/api/v1/posts", "", withAccessCookie(testAccessToken)).Code)
	}

	response := send(router, http.MethodGet, "/api/v1/posts", "", withAccessCookie(testAccessToken))
	requireProblem(t, response, http.StatusTooManyRequests)
	assert.Equal(t, "1", response.Header().Get("Retry-After"))

	assert.Equal(t, http.StatusOK, send(router, http.MethodGet, "/api/v1/posts", "", withAccessCookie(editorAccessToken)).Code,
		"each user has its own bucket")
	assert.Equal(t, http.StatusOK, get(router, "/api/v1/posts").Code, "the IP bucket was not spent")
	assert.Equal(t, http.StatusTooManyRequests, get(router, "/api/v1/posts").Code, "anonymous traffic keeps the IP limit")
}

func TestPreflightDoesNotSpendTheGlobalBucket(t *testing.T) {
	router := bucketsRouter(t, RateLimits{Global: RateLimit{PerMinute: 1, Burst: 1}})

	// Origen permitido, ajeno y ausente: ninguno pasa por el bucket global.
	for _, origin := range []string{testOrigin, badOrigin, ""} {
		for range 10 {
			response := send(router, http.MethodOptions, "/api/v1/admin/posts", "", preflightHeaders(origin))
			require.NotEqual(t, http.StatusTooManyRequests, response.Code, "origin %q", origin)
		}
	}

	assert.Equal(t, http.StatusOK, get(router, "/api/v1/posts").Code, "the global bucket is still full")
	assert.Equal(t, http.StatusTooManyRequests, get(router, "/api/v1/posts").Code, "and it holds one token")
}

func TestPreflightBucketLimits(t *testing.T) {
	router := bucketsRouter(t, RateLimits{Preflight: RateLimit{PerMinute: 60, Burst: 2}})

	for range 2 {
		assert.Equal(t, http.StatusNoContent, send(router, http.MethodOptions, loginPath, "", preflightHeaders(testOrigin)).Code)
	}

	response := send(router, http.MethodOptions, loginPath, "", preflightHeaders(testOrigin))
	requireProblem(t, response, http.StatusTooManyRequests)
	assert.Equal(t, "1", response.Header().Get("Retry-After"))

	foreign := send(router, http.MethodOptions, "/health", "", preflightHeaders(badOrigin))
	assert.Equal(t, http.StatusTooManyRequests, foreign.Code, "the bucket covers every origin and route")

	other := httptest.NewRequest(http.MethodOptions, loginPath, nil)
	other.RemoteAddr = otherClientKey + ":1234"
	for name, value := range preflightHeaders(testOrigin) {
		other.Header.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, other)
	assert.Equal(t, http.StatusNoContent, recorder.Code, "each IP has its own preflight bucket")

	assert.Equal(t, http.StatusOK, get(router, "/api/v1/posts").Code, "regular requests are not affected")
}
