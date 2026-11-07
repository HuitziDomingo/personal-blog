package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/logging"
)

func TestAccessLogWritesCloudLoggingHTTPRequest(t *testing.T) {
	var out bytes.Buffer
	router := gin.New()
	router.Use(AccessLog(logging.New(&out, logging.JSON)))
	router.GET("/api/v1/posts", func(c *gin.Context) {
		// Como el validador: reescribe la query con los valores por defecto.
		c.Request.URL.RawQuery = "limit=5&offset=0"
		c.String(http.StatusOK, "hola")
	})
	router.GET("/boom", func(c *gin.Context) { c.Status(http.StatusInternalServerError) })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/posts?limit=5", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.Header.Set("Cookie", "access_token=secret-cookie")
	router.ServeHTTP(httptest.NewRecorder(), req)

	var entry map[string]any
	require.NoError(t, json.Unmarshal(out.Bytes(), &entry), out.String())
	assert.Equal(t, "INFO", entry["severity"])
	assert.Equal(t, "request", entry["message"])

	httpRequest, ok := entry["httpRequest"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "GET", httpRequest["requestMethod"])
	// Solo la ruta: la query no llega al log.
	assert.Equal(t, "/api/v1/posts", httpRequest["requestUrl"])
	assert.InDelta(t, http.StatusOK, httpRequest["status"], 0)
	assert.Equal(t, "4", httpRequest["responseSize"])
	assert.Equal(t, "test-agent", httpRequest["userAgent"])
	assert.Regexp(t, `^\d+\.\d{6}s$`, httpRequest["latency"])
	assert.NotContains(t, out.String(), "secret-cookie")

	out.Reset()
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/boom", nil))
	require.NoError(t, json.Unmarshal(out.Bytes(), &entry))
	assert.Equal(t, "ERROR", entry["severity"])
}

func TestAccessLevelByStatus(t *testing.T) {
	cases := map[int]string{
		http.StatusOK:                  "INFO",
		http.StatusNoContent:           "INFO",
		http.StatusUnauthorized:        "INFO",
		http.StatusNotFound:            "INFO",
		http.StatusBadRequest:          "WARNING",
		http.StatusForbidden:           "WARNING",
		http.StatusTooManyRequests:     "WARNING",
		http.StatusInternalServerError: "ERROR",
		http.StatusServiceUnavailable:  "ERROR",
	}

	for status, severity := range cases {
		assert.Equal(t, severity, logging.Severity(accessLevel(status)), status)
	}
}

func TestNewRouterWritesJSONAccessLogsWhenAsked(t *testing.T) {
	var out bytes.Buffer
	cfg := testRouterConfig()
	cfg.JSONLogs = true
	cfg.Logger = logging.New(&out, logging.JSON)
	router := newTestRouterWith(t, cfg)

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health", nil))

	var entry map[string]any
	require.NoError(t, json.Unmarshal(out.Bytes(), &entry), out.String())
	assert.Equal(t, "request", entry["message"])
}

func TestNewRouterNeedsALoggerForJSONLogs(t *testing.T) {
	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)
	cfg := testRouterConfig()
	cfg.JSONLogs = true

	_, err = NewRouter(&fakePinger{}, spec, cfg)

	require.EqualError(t, err, "router needs a logger for JSON access logs")
}

func TestPanicsAreNotDumpedWithTheRequestHeaders(t *testing.T) {
	var out bytes.Buffer
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &out
	t.Cleanup(func() { gin.DefaultErrorWriter = previous })
	gin.SetMode(gin.DebugMode)
	t.Cleanup(func() { gin.SetMode(gin.TestMode) })

	router := newTestRouterWith(t, testRouterConfig())
	router.GET("/boom", func(*gin.Context) { panic("boom") })
	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	req.Header.Set("Cookie", "access_token=secret-cookie")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.NotContains(t, out.String(), "secret-cookie")
}
