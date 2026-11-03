package handler

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	proxyAddr  = "169.254.1.1:40000"
	proxyRange = "169.254.0.0/16"
	realClient = "203.0.113.9"
)

// fakeClock es un reloj que solo avanza cuando el test lo pide.
type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func (c *fakeClock) advance(d time.Duration) { c.now = c.now.Add(d) }

func newFakeClock() *fakeClock { return &fakeClock{now: time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)} }

func TestIPLimiterBurstThenRefill(t *testing.T) {
	clock := newFakeClock()
	limiter := newIPLimiter(RateLimit{PerMinute: 60, Burst: 2}, clock.Now)

	for range 2 {
		ok, _ := limiter.allow(realClient)
		require.True(t, ok)
	}

	ok, delay := limiter.allow(realClient)
	require.False(t, ok)
	assert.Equal(t, time.Second, delay)

	ok, _ = limiter.allow("198.51.100.7")
	assert.True(t, ok, "each IP has its own bucket")

	clock.advance(time.Second)
	ok, _ = limiter.allow(realClient)
	assert.True(t, ok, "one token refills per second at 60 per minute")
}

func TestIPLimiterRejectionDoesNotSpendTokens(t *testing.T) {
	clock := newFakeClock()
	limiter := newIPLimiter(RateLimit{PerMinute: 60, Burst: 1}, clock.Now)

	ok, _ := limiter.allow(realClient)
	require.True(t, ok)

	for range 5 {
		ok, _ = limiter.allow(realClient)
		require.False(t, ok)
	}

	clock.advance(time.Second)
	ok, _ = limiter.allow(realClient)
	assert.True(t, ok)
}

func TestIPLimiterForgetsIdleClients(t *testing.T) {
	clock := newFakeClock()
	limiter := newIPLimiter(RateLimit{PerMinute: 60, Burst: 20}, clock.Now)

	limiter.allow("198.51.100.1")
	limiter.allow("198.51.100.2")
	require.Equal(t, 2, limiter.size())

	clock.advance(cleanupInterval)
	limiter.allow("198.51.100.2")
	assert.Equal(t, 2, limiter.size(), "idle for less than the TTL")

	// El siguiente barrido llega a los 6 minutos: 198.51.100.1 lleva 6 inactiva y
	// 198.51.100.2 lleva 3.
	clock.advance(cleanupInterval)
	limiter.allow("198.51.100.3")
	assert.Equal(t, 2, limiter.size(), "198.51.100.1 is forgotten")
}

func TestIPLimiterKeepsClientsUntilTheirBucketRefills(t *testing.T) {
	clock := newFakeClock()
	limiter := newIPLimiter(RateLimit{PerMinute: 1, Burst: 10}, clock.Now)

	limiter.allow(realClient)
	clock.advance(minIdleTTL + time.Minute)
	limiter.allow("198.51.100.1")

	assert.Equal(t, 2, limiter.size(), "forgetting it before 10 minutes would refill its bucket early")
}

func TestIPLimiterIsSafeForConcurrentUse(t *testing.T) {
	limiter := newIPLimiter(RateLimit{PerMinute: 1, Burst: 10}, time.Now)

	var allowed atomic.Int32
	var requests sync.WaitGroup
	for range 100 {
		requests.Go(func() {
			if ok, _ := limiter.allow(realClient); ok {
				allowed.Add(1)
			}
		})
	}
	requests.Wait()

	assert.EqualValues(t, 10, allowed.Load())
}

func TestRetryAfterSecondsRoundsUp(t *testing.T) {
	assert.Equal(t, 1, retryAfterSeconds(time.Millisecond))
	assert.Equal(t, 1, retryAfterSeconds(time.Second))
	assert.Equal(t, 12, retryAfterSeconds(11*time.Second+time.Millisecond))
}

func TestClientKeyGroupsIPv6ByPrefix(t *testing.T) {
	assert.Equal(t, realClient, clientKey(realClient))
	assert.Equal(t, "2001:db8:1:2::/64", clientKey("2001:db8:1:2:aaaa::1"))
	assert.Equal(t, clientKey("2001:db8:1:2::1"), clientKey("2001:db8:1:2:ffff::9"))
	assert.NotEqual(t, clientKey("2001:db8:1:2::1"), clientKey("2001:db8:1:3::1"))
}

func limitedRouter(t *testing.T, global, login RateLimit) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.RateLimits.Global = global
	cfg.RateLimits.Login = login

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	router, err := NewRouter(&fakePinger{}, spec, cfg)
	require.NoError(t, err)

	return router
}

func TestGlobalRateLimit(t *testing.T) {
	generous := RateLimit{PerMinute: 10000, Burst: 10000}
	router := limitedRouter(t, RateLimit{PerMinute: 1, Burst: 2}, generous)

	// Las operaciones aún responden 501; aquí solo importa que no sea 429.
	for range 2 {
		assert.Equal(t, http.StatusNotImplemented, get(router, "/api/v1/posts").Code)
	}

	response := send(router, http.MethodGet, "/api/v1/posts", "", map[string]string{"Origin": testOrigin})

	problem := requireProblem(t, response, http.StatusTooManyRequests)
	assert.Equal(t, detailRateLimited, *problem.Detail)
	assert.Equal(t, "60", response.Header().Get("Retry-After"))
	assert.Equal(t, testOrigin, response.Header().Get("Access-Control-Allow-Origin"), "the frontend can read the 429")
	assert.Equal(t, "Retry-After", response.Header().Get("Access-Control-Expose-Headers"), "and its Retry-After")
	assert.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))

	assert.Equal(t, http.StatusOK, get(router, "/health").Code, "outside /api/v1")
	assert.Equal(t, http.StatusOK, get(router, "/ready").Code, "outside /api/v1")
}

func TestLoginRateLimit(t *testing.T) {
	generous := RateLimit{PerMinute: 10000, Burst: 10000}
	router := limitedRouter(t, generous, RateLimit{PerMinute: 5, Burst: 1})

	first := send(router, http.MethodPost, loginPath, loginBody, nil)
	second := send(router, http.MethodPost, loginPath, loginBody, nil)

	assert.Equal(t, http.StatusUnauthorized, first.Code)
	requireProblem(t, second, http.StatusTooManyRequests)
	assert.Equal(t, "12", second.Header().Get("Retry-After"))
	assert.Equal(t, "no-store", second.Header().Get("Cache-Control"))
	assert.Equal(t, http.StatusNotImplemented, get(router, "/api/v1/posts").Code, "other routes keep only the global limit")
}

func TestRefreshRateLimit(t *testing.T) {
	cfg := testRouterConfig()
	cfg.RateLimits.Refresh = RateLimit{PerMinute: 10, Burst: 1}

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)
	router, err := NewRouter(&fakePinger{}, spec, cfg)
	require.NoError(t, err)

	assert.NotEqual(t, http.StatusTooManyRequests, send(router, http.MethodPost, refreshPath, "", nil).Code)

	response := send(router, http.MethodPost, refreshPath, "", nil)
	requireProblem(t, response, http.StatusTooManyRequests)
	assert.Equal(t, "6", response.Header().Get("Retry-After"))
}

func TestInvalidTrustedProxiesFailRouterCreation(t *testing.T) {
	cfg := testRouterConfig()
	cfg.TrustedProxies = []string{"not-an-ip"}

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.Error(t, err)
}

// ipRouter monta solo el limitador sobre la configuración de IP de cada caso.
func ipRouter(configure func(*gin.Engine) error) (*gin.Engine, error) {
	router := gin.New()
	if err := configure(router); err != nil {
		return nil, err
	}

	router.Use(newRateLimiter(RateLimits{
		Global:  RateLimit{PerMinute: 1, Burst: 1},
		Login:   RateLimit{PerMinute: 1, Burst: 1},
		Refresh: RateLimit{PerMinute: 1, Burst: 1},
	}, time.Now).handle)
	router.GET("/api/v1/posts", func(c *gin.Context) { c.Status(http.StatusOK) })

	return router, nil
}

func fromProxy(router *gin.Engine, headers map[string]string) int {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/posts", nil)
	request.RemoteAddr = proxyAddr

	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	return response.Code
}

// Cloud Run agrega la IP real al final de X-Forwarded-For; lo anterior lo
// escribe el cliente. Cada petición finge ser otra IP al principio.
func TestSpoofedForwardedForDoesNotEvadeTheLimit(t *testing.T) {
	spoofed := func(fake string) map[string]string {
		return map[string]string{"X-Forwarded-For": fake + ", " + realClient}
	}

	tests := []struct {
		name      string
		configure func(*gin.Engine) error
		evaded    bool
	}{
		{
			name:      "gin default trusts every proxy",
			configure: func(*gin.Engine) error { return nil },
			evaded:    true,
		},
		{
			name:      "no trusted proxies uses the socket address",
			configure: func(router *gin.Engine) error { return configureClientIP(router, nil) },
		},
		{
			name:      "only the direct peer range is trusted",
			configure: func(router *gin.Engine) error { return configureClientIP(router, []string{proxyRange}) },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router, err := ipRouter(tt.configure)
			require.NoError(t, err)

			assert.Equal(t, http.StatusOK, fromProxy(router, spoofed("6.6.6.6")))
			second := fromProxy(router, spoofed("7.7.7.7"))

			if tt.evaded {
				assert.Equal(t, http.StatusOK, second, "documents why the default is unsafe")

				return
			}

			assert.Equal(t, http.StatusTooManyRequests, second)
		})
	}
}

// Con solo el socket, todos los clientes detrás del proxy comparten un cupo;
// con el rango del par directo, cada IP real tiene el suyo.
func TestTrustedPeerRangeSeparatesRealClients(t *testing.T) {
	tests := []struct {
		name       string
		proxies    []string
		wantSecond int
	}{
		{name: "no trusted proxies", proxies: nil, wantSecond: http.StatusTooManyRequests},
		{name: "direct peer range", proxies: []string{proxyRange}, wantSecond: http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router, err := ipRouter(func(router *gin.Engine) error { return configureClientIP(router, tt.proxies) })
			require.NoError(t, err)

			assert.Equal(t, http.StatusOK, fromProxy(router, map[string]string{"X-Forwarded-For": realClient}))
			assert.Equal(t, tt.wantSecond, fromProxy(router, map[string]string{"X-Forwarded-For": "198.51.100.7"}))
		})
	}
}

func TestXRealIPIsIgnored(t *testing.T) {
	router, err := ipRouter(func(router *gin.Engine) error { return configureClientIP(router, []string{proxyRange}) })
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, fromProxy(router, map[string]string{"X-Real-IP": "6.6.6.6"}))
	assert.Equal(t, http.StatusTooManyRequests, fromProxy(router, map[string]string{"X-Real-IP": "7.7.7.7"}))
}
