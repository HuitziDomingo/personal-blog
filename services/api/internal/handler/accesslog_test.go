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
	router.GET("/api/v1/posts", func(c *gin.Context) { c.String(http.StatusTeapot, "hola") })
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
	assert.Equal(t, "/api/v1/posts?limit=5", httpRequest["requestUrl"])
	assert.InDelta(t, http.StatusTeapot, httpRequest["status"], 0)
	assert.Equal(t, "4", httpRequest["responseSize"])
	assert.Equal(t, "test-agent", httpRequest["userAgent"])
	assert.Regexp(t, `^\d+\.\d{6}s$`, httpRequest["latency"])
	assert.NotContains(t, out.String(), "secret-cookie")

	out.Reset()
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/boom", nil))
	require.NoError(t, json.Unmarshal(out.Bytes(), &entry))
	assert.Equal(t, "ERROR", entry["severity"])
}
