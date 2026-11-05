package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const (
	testOrigin       = "https://admin.huitzi.xyz"
	testMaxBodyBytes = 1024
)

// testRouterConfig usa límites altos: solo los tests de rate limit los alcanzan.
func testRouterConfig() RouterConfig {
	generous := RateLimit{PerMinute: 10000, Burst: 10000}

	return RouterConfig{
		AllowedOrigins: []string{testOrigin},
		MaxBodyBytes:   testMaxBodyBytes,
		RateLimits:     RateLimits{Global: generous, Login: generous, Refresh: generous},
		Sessions:       newFakeSessions(),
		Posts:          newFakePosts(),
	}
}

func newTestRouter(t *testing.T, pinger Pinger) *gin.Engine {
	t.Helper()

	spec, err := LoadSpec(context.Background())
	require.NoError(t, err)

	router, err := NewRouter(pinger, spec, testRouterConfig())
	require.NoError(t, err)

	return router
}

func newContractRouter(t *testing.T) *gin.Engine {
	t.Helper()

	return newTestRouter(t, &fakePinger{})
}

func requireProblem(t *testing.T, response *httptest.ResponseRecorder, status int) gen.Problem {
	t.Helper()

	require.Equal(t, status, response.Code)
	assert.Equal(t, problemContentType, response.Header().Get("Content-Type"))

	var problem gen.Problem
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &problem))
	require.NotNil(t, problem.Status)
	require.NotNil(t, problem.Title)
	assert.EqualValues(t, status, *problem.Status)
	assert.Equal(t, http.StatusText(status), *problem.Title)

	if problem.Detail != nil {
		for _, internal := range []string{"openapi3filter", "Go struct", "json:"} {
			assert.NotContains(t, *problem.Detail, internal)
		}
	}

	return problem
}

func TestContractRoutesRespondWithProblems(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		status int
		detail string
	}{
		{name: "query out of range", method: http.MethodGet, path: "/api/v1/posts?limit=500", status: http.StatusBadRequest, detail: "limit: number must be at most 100"},
		{name: "query with wrong type", method: http.MethodGet, path: "/api/v1/posts?limit=abc", status: http.StatusBadRequest, detail: "limit: invalid parameter"},
		{name: "path against schema", method: http.MethodGet, path: "/api/v1/posts/Not_A_Slug", status: http.StatusBadRequest, detail: `slug: string doesn't match the regular expression "^[a-z0-9]+(-[a-z0-9]+)*$"`},
		{name: "body against schema", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co","password":""}`, status: http.StatusBadRequest, detail: "password: minimum string length is 1"},
		{name: "body with several violations", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":1,"password":""}`, status: http.StatusBadRequest, detail: "email: value must be a string; password: minimum string length is 1"},
		{name: "body with wrong type", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co","password":12345}`, status: http.StatusBadRequest, detail: "password: value must be a string"},
		{name: "body with missing field", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co"}`, status: http.StatusBadRequest, detail: `password: property "password" is missing`},
		{name: "body rejected when decoded", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"nope","password":"x"}`, status: http.StatusBadRequest, detail: detailInvalidBody},
		{name: "malformed body", method: http.MethodPost, path: "/api/v1/auth/login", body: `{`, status: http.StatusBadRequest, detail: "invalid request body"},
		{name: "protected route without session", method: http.MethodGet, path: "/api/v1/admin/posts", status: http.StatusUnauthorized, detail: "authentication required"},
		{name: "current user without session", method: http.MethodGet, path: "/api/v1/auth/me", status: http.StatusUnauthorized, detail: "authentication required"},
		{name: "refresh without cookie", method: http.MethodPost, path: "/api/v1/auth/refresh", status: http.StatusUnauthorized, detail: "authentication required"},
		{name: "authentication before body", method: http.MethodPost, path: "/api/v1/admin/posts", body: `{"title":1}`, status: http.StatusUnauthorized, detail: "authentication required"},
		{name: "unknown route", method: http.MethodGet, path: "/api/v1/nope", status: http.StatusNotFound},
		{name: "unsupported method", method: http.MethodDelete, path: "/api/v1/posts", status: http.StatusNotFound},
		{name: "valid request reaches the handler", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co","password":"x"}`, status: http.StatusUnauthorized, detail: "invalid credentials"},
		{name: "public route reaches the handler", method: http.MethodGet, path: "/api/v1/posts/hello-world", status: http.StatusNotFound},
	}

	router := newContractRouter(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			problem := requireProblem(t, response, tt.status)
			if tt.detail == "" {
				assert.Nil(t, problem.Detail)

				return
			}

			require.NotNil(t, problem.Detail)
			assert.Equal(t, tt.detail, *problem.Detail)
		})
	}
}

func TestProblemsDoNotEchoPassword(t *testing.T) {
	const password = "s3cret-value"
	router := newContractRouter(t)
	body := `{"email":"nope","password":"` + password + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	requireProblem(t, response, http.StatusBadRequest)
	assert.NotContains(t, response.Body.String(), password)
}

func TestOperationalRoutesSkipContractValidation(t *testing.T) {
	response := get(newContractRouter(t), "/health")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, "application/json; charset=utf-8", response.Header().Get("Content-Type"))
}

func TestErrorHandlers(t *testing.T) {
	sensitive := errors.New("mongodb://root:secret@host")
	decoding := errors.New("json: cannot unmarshal number into Go struct field LoginRequest.password of type string")

	tests := []struct {
		name   string
		handle func(c *gin.Context)
		status int
		detail string
	}{
		{
			name:   "parameter binding hides the cause",
			handle: func(c *gin.Context) { bindError(c, decoding, http.StatusBadRequest) },
			status: http.StatusBadRequest,
			detail: detailInvalidParameter,
		},
		{
			name:   "request decoding hides the cause",
			handle: func(c *gin.Context) { requestError(c, decoding) },
			status: http.StatusBadRequest,
			detail: detailInvalidBody,
		},
		{
			name:   "validator keeps a described violation",
			handle: func(c *gin.Context) { validationError(c, violationPrefix+"limit: too large", http.StatusBadRequest) },
			status: http.StatusBadRequest,
			detail: "limit: too large",
		},
		{
			name: "validator hides any other message",
			handle: func(c *gin.Context) {
				validationError(c, "error in openapi3filter.RequestError: secret", http.StatusBadRequest)
			},
			status: http.StatusBadRequest,
			detail: detailInvalidRequest,
		},
		{
			name:   "operation without implementation",
			handle: func(c *gin.Context) { handlerError(c, errNotImplemented) },
			status: http.StatusNotImplemented,
		},
		{
			name:   "operation failure hides the cause",
			handle: func(c *gin.Context) { handlerError(c, sensitive) },
			status: http.StatusInternalServerError,
		},
		{
			name:   "response failure hides the cause",
			handle: func(c *gin.Context) { responseError(c, sensitive) },
			status: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(response)
			c.Request = httptest.NewRequest(http.MethodGet, "/", nil)

			tt.handle(c)

			problem := requireProblem(t, response, tt.status)
			assert.True(t, c.IsAborted())
			assert.NotContains(t, response.Body.String(), "secret")

			if tt.detail == "" {
				assert.Nil(t, problem.Detail)

				return
			}

			require.NotNil(t, problem.Detail)
			assert.Equal(t, tt.detail, *problem.Detail)
		})
	}
}

func TestPanicRespondsWithProblem(t *testing.T) {
	router := newContractRouter(t)
	router.GET("/panic", func(*gin.Context) { panic("secret") })

	response := get(router, "/panic")

	problem := requireProblem(t, response, http.StatusInternalServerError)
	assert.Nil(t, problem.Detail)
	assert.NotContains(t, response.Body.String(), "secret")
}

func TestResponseErrorKeepsResponseAlreadyStarted(t *testing.T) {
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.JSON(http.StatusOK, gin.H{"partial": true})

	responseError(c, errors.New("encode failed"))

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"partial":true}`, response.Body.String())
}
