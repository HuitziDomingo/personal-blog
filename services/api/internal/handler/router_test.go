package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type fakePinger struct {
	err         error
	calls       int
	hasDeadline bool
}

func (f *fakePinger) Ping(ctx context.Context) error {
	f.calls++
	_, f.hasDeadline = ctx.Deadline()

	return f.err
}

func get(router *gin.Engine, path string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	return response
}

func TestHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{err: errors.New("database down")}

	response := get(NewRouter(pinger), "/health")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"status":"ok"}`, response.Body.String())
	assert.Zero(t, pinger.calls)
}

func TestReady(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{}

	response := get(NewRouter(pinger), "/ready")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"status":"ready"}`, response.Body.String())
	assert.Equal(t, 1, pinger.calls)
	assert.True(t, pinger.hasDeadline)
}

func TestReadyReturnsUnavailableWhenPingFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{err: errors.New("database down")}

	response := get(NewRouter(pinger), "/ready")

	assert.Equal(t, http.StatusServiceUnavailable, response.Code)
	assert.JSONEq(t, `{"status":"unavailable"}`, response.Body.String())
}
