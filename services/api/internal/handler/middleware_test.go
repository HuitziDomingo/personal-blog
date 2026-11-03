package handler

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

const (
	loginBody = `{"email":"a@b.co","password":"x"}`
	badOrigin = "https://evil.example"
)

func send(router *gin.Engine, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}

	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	return response
}

func TestSecurityHeaders(t *testing.T) {
	router := newContractRouter(t)
	router.GET("/panic", func(*gin.Context) { panic("secret") })

	tests := []struct {
		name string
		path string
	}{
		{name: "normal response", path: "/health"},
		{name: "missing route", path: "/nope"},
		{name: "contract route", path: "/api/v1/posts"},
		{name: "panic", path: "/panic"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			header := get(router, tt.path).Header()

			assert.Equal(t, "max-age=31536000; includeSubDomains", header.Get("Strict-Transport-Security"))
			assert.Equal(t, "nosniff", header.Get("X-Content-Type-Options"))
			assert.Equal(t, "no-referrer", header.Get("Referrer-Policy"))
			assert.Equal(t, "default-src 'none'; frame-ancestors 'none'", header.Get("Content-Security-Policy"))
		})
	}
}

func TestCacheControlOnlyOnAuthRoutes(t *testing.T) {
	router := newContractRouter(t)

	login := send(router, http.MethodPost, loginPath, loginBody, nil)
	posts := get(router, "/api/v1/posts")

	assert.Equal(t, "no-store", login.Header().Get("Cache-Control"))
	assert.Empty(t, posts.Header().Get("Cache-Control"))
}

func TestBodyLimit(t *testing.T) {
	router := newContractRouter(t)
	padding := strings.Repeat("a", testMaxBodyBytes)

	t.Run("over the limit", func(t *testing.T) {
		response := send(router, http.MethodPost, loginPath, `{"email":"`+padding+`"}`, nil)

		problem := requireProblem(t, response, http.StatusRequestEntityTooLarge)
		assert.Equal(t, detailBodyTooLarge, *problem.Detail)
	})

	t.Run("over the limit without content length", func(t *testing.T) {
		reader, writer := io.Pipe()
		go func() {
			_, _ = writer.Write([]byte(padding + padding))
			_ = writer.Close()
		}()

		request := httptest.NewRequest(http.MethodPost, loginPath, reader)
		request.Header.Set("Content-Type", "application/json")
		request.ContentLength = -1
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)

		requireProblem(t, response, http.StatusRequestEntityTooLarge)
	})

	t.Run("at the limit reaches the validator", func(t *testing.T) {
		response := send(router, http.MethodPost, loginPath, padding, nil)

		requireProblem(t, response, http.StatusBadRequest)
	})

	t.Run("body stays readable below the limit", func(t *testing.T) {
		response := send(router, http.MethodPost, loginPath, loginBody, nil)

		problem := requireProblem(t, response, http.StatusUnauthorized)
		assert.Equal(t, detailLoginFailed, *problem.Detail, "the handler decoded the body")
	})
}

func TestPreflight(t *testing.T) {
	router := newContractRouter(t)

	t.Run("allowed origin", func(t *testing.T) {
		response := send(router, http.MethodOptions, loginPath, "", map[string]string{
			"Origin":                        testOrigin,
			"Access-Control-Request-Method": http.MethodPost,
		})

		assert.Equal(t, http.StatusNoContent, response.Code)
		assert.Equal(t, testOrigin, response.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
		assert.Contains(t, response.Header().Get("Access-Control-Allow-Methods"), http.MethodPost)
		assert.Equal(t, "Content-Type", response.Header().Get("Access-Control-Allow-Headers"))
		assert.Equal(t, "600", response.Header().Get("Access-Control-Max-Age"))
		assert.Contains(t, response.Header().Values("Vary"), "Origin")
	})

	t.Run("foreign origin", func(t *testing.T) {
		response := send(router, http.MethodOptions, loginPath, "", map[string]string{
			"Origin":                        badOrigin,
			"Access-Control-Request-Method": http.MethodPost,
		})

		requireProblem(t, response, http.StatusForbidden)
		assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestOriginCheckOnStateChangingMethods(t *testing.T) {
	router := newContractRouter(t)
	router.Handle(http.MethodPatch, "/patch", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.Handle(http.MethodPost, "/post", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.Handle(http.MethodPut, "/put", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.Handle(http.MethodDelete, "/delete", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	methods := map[string]string{
		http.MethodPost:   "/post",
		http.MethodPut:    "/put",
		http.MethodPatch:  "/patch",
		http.MethodDelete: "/delete",
	}

	for method, path := range methods {
		t.Run(method, func(t *testing.T) {
			foreign := send(router, method, path, "", map[string]string{"Origin": badOrigin})
			problem := requireProblem(t, foreign, http.StatusForbidden)
			assert.Equal(t, detailOriginForbidden, *problem.Detail)

			missing := send(router, method, path, "", nil)
			assert.Equal(t, http.StatusNoContent, missing.Code)
			assert.Empty(t, missing.Header().Get("Access-Control-Allow-Origin"))

			allowed := send(router, method, path, "", map[string]string{"Origin": testOrigin})
			assert.Equal(t, http.StatusNoContent, allowed.Code)
			assert.Equal(t, testOrigin, allowed.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "true", allowed.Header().Get("Access-Control-Allow-Credentials"))
		})
	}
}

func TestForeignOriginIsNotBlockedOnGet(t *testing.T) {
	response := send(newContractRouter(t), http.MethodGet, "/health", "", map[string]string{"Origin": badOrigin})

	assert.Equal(t, http.StatusOK, response.Code)
	assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
}

func TestOriginCheckRunsBeforeTheBodyLimit(t *testing.T) {
	body := strings.Repeat("a", testMaxBodyBytes+1)
	response := send(newContractRouter(t), http.MethodPost, loginPath, body, map[string]string{"Origin": badOrigin})

	requireProblem(t, response, http.StatusForbidden)
}

func TestPanicLeavesAccessLogLine(t *testing.T) {
	var logs bytes.Buffer
	previous := gin.DefaultWriter
	gin.DefaultWriter = &logs
	t.Cleanup(func() { gin.DefaultWriter = previous })

	router := newContractRouter(t)
	router.GET("/panic", func(*gin.Context) { panic("secret") })

	response := get(router, "/panic")

	requireProblem(t, response, http.StatusInternalServerError)
	assert.Regexp(t, `\| 500 \|.*GET\s+"/panic"`, logs.String())
}

func TestOriginCheckRunsBeforeTheContractValidator(t *testing.T) {
	response := send(newContractRouter(t), http.MethodPost, loginPath, `{`, map[string]string{"Origin": badOrigin})

	requireProblem(t, response, http.StatusForbidden)
}
