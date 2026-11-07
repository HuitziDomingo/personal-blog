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
	secret := []byte(bucketsSecret)
	hs256 := jwt.SigningMethodHS256

	// claims son los de un token válido en now, con los cambios indicados; un
	// valor nil borra el claim.
	claims := func(now time.Time, changes jwt.MapClaims) jwt.MapClaims {
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

	tests := []struct {
		name string
		// token devuelve el token; wait es cuánto avanza el reloj después de
		// emitirlo y antes de las peticiones.
		token func(t *testing.T, tokens *service.TokenService, now time.Time) string
		wait  time.Duration
		valid bool
	}{
		{name: "valid token is the control", valid: true, token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, nil))
		}},
		{name: "issued by TokenService is the control too", valid: true, token: func(t *testing.T, tokens *service.TokenService, _ time.Time) string {
			token, err := tokens.IssueAccess(testUser)
			require.NoError(t, err)

			return token
		}},
		{name: "expired", wait: service.AccessTokenTTL + time.Second, token: func(t *testing.T, tokens *service.TokenService, _ time.Time) string {
			token, err := tokens.IssueAccess(testUser)
			require.NoError(t, err)

			return token
		}},
		{name: "other audience", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, jwt.MapClaims{"aud": []string{"huitzi.xyz/web"}}))
		}},
		{name: "other issuer", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, jwt.MapClaims{"iss": "evil.example"}))
		}},
		{name: "without exp", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, jwt.MapClaims{"exp": nil}))
		}},
		{name: "issued later", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, jwt.MapClaims{"iat": now.Add(time.Hour).Unix()}))
		}},
		{name: "other secret", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, []byte("another-secret-that-is-32-bytes!!!"), claims(now, nil))
		}},
		{name: "alg none", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, claims(now, nil))
		}},
		{name: "HS512", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, jwt.SigningMethodHS512, secret, claims(now, nil))
		}},
		{name: "without subject", token: func(t *testing.T, _ *service.TokenService, now time.Time) string {
			return signed(t, hs256, secret, claims(now, jwt.MapClaims{"sub": nil}))
		}},
		{name: "garbage", token: func(*testing.T, *service.TokenService, time.Time) string { return "not-a-jwt" }},
		{name: "empty", token: func(*testing.T, *service.TokenService, time.Time) string { return "" }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reloj y TokenService propios: ningún caso depende de otro.
			clock := newFakeClock()
			tokens, err := service.NewTokenService(secret, nil, nil, clock.Now)
			require.NoError(t, err)

			token := tt.token(t, tokens, clock.Now())
			clock.advance(tt.wait)

			// Ráfaga global de 1 y de usuario de 100: con un token que diera
			// el bucket de usuario, la segunda petición pasaría.
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

			codes := make([]int, 0, 3)
			for range 3 {
				codes = append(codes, send(router, http.MethodGet, "/api/v1/posts", "", withAccessCookie(token)).Code)
			}

			if tt.valid {
				assert.Equal(t, []int{http.StatusOK, http.StatusOK, http.StatusOK}, codes)
				assert.Equal(t, 1, limiter.users.size())
				assert.Zero(t, limiter.global.size())

				return
			}

			assert.Equal(t, []int{http.StatusOK, http.StatusTooManyRequests, http.StatusTooManyRequests}, codes)
			assert.Zero(t, limiter.users.size(), "the user bucket is never created")
			assert.Equal(t, 1, limiter.global.size())
		})
	}
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

	// Origen permitido y ajeno: ninguno pasa por el bucket global.
	for _, origin := range []string{testOrigin, badOrigin} {
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

// Un OPTIONS sin Origin, o sin Access-Control-Request-Method, no es un
// preflight CORS: crossOrigin no lo responde y gasta el bucket global, no el de
// preflight.
func TestOptionsThatAreNotCORSPreflightsSpendTheGlobalBucket(t *testing.T) {
	notPreflights := map[string]map[string]string{
		"without Origin":                        preflightHeaders(""),
		"without Access-Control-Request-Method": {"Origin": testOrigin},
	}

	for name, headers := range notPreflights {
		t.Run(name, func(t *testing.T) {
			router := bucketsRouter(t, RateLimits{
				Global:    RateLimit{PerMinute: 1, Burst: 1},
				Preflight: RateLimit{PerMinute: 1, Burst: 1},
			})

			assert.NotEqual(t, http.StatusTooManyRequests, send(router, http.MethodOptions, "/api/v1/posts", "", headers).Code)
			assert.Equal(t, http.StatusTooManyRequests, send(router, http.MethodOptions, "/api/v1/posts", "", headers).Code)
			assert.Equal(t, http.StatusTooManyRequests, get(router, "/api/v1/posts").Code, "it was the global bucket")
			assert.Equal(t, http.StatusNoContent, send(router, http.MethodOptions, "/api/v1/posts", "", preflightHeaders(testOrigin)).Code,
				"the preflight bucket is untouched")
		})
	}
}

// ADR-016, punto 4: con sesión válida, login y refresh siguen limitados por IP,
// aunque cada petición use otro usuario.
func TestAuthLimitsStayPerIPWithAValidSession(t *testing.T) {
	cfg := testRouterConfig()
	cfg.RateLimits.Login = RateLimit{PerMinute: 5, Burst: 1}
	cfg.RateLimits.Refresh = RateLimit{PerMinute: 10, Burst: 1}
	router := newTestRouterWith(t, cfg)

	login := func(token string) int {
		return send(router, http.MethodPost, loginPath, loginBody, withAccessCookie(token)).Code
	}
	refresh := func(token string) int {
		return send(router, http.MethodPost, refreshPath, "", withAccessCookie(token)).Code
	}

	assert.NotEqual(t, http.StatusTooManyRequests, login(testAccessToken))
	assert.Equal(t, http.StatusTooManyRequests, login(editorAccessToken))
	assert.NotEqual(t, http.StatusTooManyRequests, refresh(testAccessToken))
	assert.Equal(t, http.StatusTooManyRequests, refresh(editorAccessToken))
}
