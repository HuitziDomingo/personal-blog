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

func newTestRouter(t *testing.T, pinger Pinger) *gin.Engine {
	t.Helper()

	spec, err := LoadSpec(context.Background())
	require.NoError(t, err)

	return NewRouter(pinger, spec)
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

	return problem
}

func TestContractRoutesRespondWithProblems(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		status int
	}{
		{name: "query out of range", method: http.MethodGet, path: "/api/v1/posts?limit=500", status: http.StatusBadRequest},
		{name: "query with wrong type", method: http.MethodGet, path: "/api/v1/posts?limit=abc", status: http.StatusBadRequest},
		{name: "path against schema", method: http.MethodGet, path: "/api/v1/posts/Not_A_Slug", status: http.StatusBadRequest},
		{name: "body against schema", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co","password":""}`, status: http.StatusBadRequest},
		{name: "body rejected when decoded", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"nope","password":"x"}`, status: http.StatusBadRequest},
		{name: "malformed body", method: http.MethodPost, path: "/api/v1/auth/login", body: `{`, status: http.StatusBadRequest},
		{name: "protected route until authentication exists", method: http.MethodGet, path: "/api/v1/admin/posts", status: http.StatusBadRequest},
		{name: "unknown route", method: http.MethodGet, path: "/api/v1/nope", status: http.StatusNotFound},
		{name: "unsupported method", method: http.MethodDelete, path: "/api/v1/posts", status: http.StatusNotFound},
		{name: "valid request without implementation", method: http.MethodPost, path: "/api/v1/auth/login", body: `{"email":"a@b.co","password":"x"}`, status: http.StatusNotImplemented},
		{name: "public route without implementation", method: http.MethodGet, path: "/api/v1/posts/hello-world", status: http.StatusNotImplemented},
	}

	router := newContractRouter(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			requireProblem(t, response, tt.status)
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

	tests := []struct {
		name   string
		handle func(c *gin.Context)
		status int
		detail string
	}{
		{
			name:   "parameter binding keeps the reason",
			handle: func(c *gin.Context) { bindError(c, errors.New("bad parameter"), http.StatusBadRequest) },
			status: http.StatusBadRequest,
			detail: "bad parameter",
		},
		{
			name:   "request decoding keeps the reason",
			handle: func(c *gin.Context) { requestError(c, errors.New("bad body")) },
			status: http.StatusBadRequest,
			detail: "bad body",
		},
		{
			name:   "validator keeps its status",
			handle: func(c *gin.Context) { validationError(c, "no matching operation", http.StatusNotFound) },
			status: http.StatusNotFound,
			detail: "no matching operation",
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

func TestResponseErrorKeepsResponseAlreadyStarted(t *testing.T) {
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.JSON(http.StatusOK, gin.H{"partial": true})

	responseError(c, errors.New("encode failed"))

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"partial":true}`, response.Body.String())
}
