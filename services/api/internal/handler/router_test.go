package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakePinger struct {
	err         error
	calls       int
	hasDeadline bool
	canceled    bool
	delay       time.Duration
}

func (f *fakePinger) Ping(ctx context.Context) error {
	f.calls++
	_, f.hasDeadline = ctx.Deadline()
	f.canceled = ctx.Err() != nil

	time.Sleep(f.delay)

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

	response := get(newTestRouter(t, pinger), "/health")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"status":"ok"}`, response.Body.String())
	assert.Zero(t, pinger.calls)
}

func TestReady(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{}

	response := get(newTestRouter(t, pinger), "/ready")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"status":"ready"}`, response.Body.String())
	assert.Equal(t, 1, pinger.calls)
	assert.True(t, pinger.hasDeadline)
}

func TestReadyReturnsUnavailableWhenPingFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{err: errors.New("database down")}

	response := get(newTestRouter(t, pinger), "/ready")

	assert.Equal(t, http.StatusServiceUnavailable, response.Code)
	assert.JSONEq(t, `{"status":"unavailable"}`, response.Body.String())
}

func TestReadyCachesPingAcrossRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pinger := &fakePinger{}
	router := newTestRouter(t, pinger)

	get(router, "/ready")
	response := get(router, "/ready")

	assert.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, 1, pinger.calls)
}

func TestReadinessCachesResultUntilExpiry(t *testing.T) {
	failure := errors.New("database down")
	now := time.Now()
	pinger := &fakePinger{err: failure}
	status := newReadiness(pinger, func() time.Time { return now })

	require.ErrorIs(t, status.check(t.Context()), failure)

	pinger.err = nil
	now = now.Add(readyCacheTTL - time.Millisecond)
	require.ErrorIs(t, status.check(t.Context()), failure, "failures are cached too")
	assert.Equal(t, 1, pinger.calls)

	now = now.Add(time.Millisecond)
	require.NoError(t, status.check(t.Context()))
	assert.Equal(t, 2, pinger.calls)
}

func TestReadinessPingsOnceWithConcurrentRequests(t *testing.T) {
	pinger := &fakePinger{delay: 10 * time.Millisecond}
	status := newReadiness(pinger, time.Now)

	var requests sync.WaitGroup
	for range 50 {
		requests.Go(func() {
			assert.NoError(t, status.check(context.Background()))
		})
	}
	requests.Wait()

	assert.Equal(t, 1, pinger.calls)
}

func TestReadinessPingIgnoresRequestCancellation(t *testing.T) {
	pinger := &fakePinger{}
	status := newReadiness(pinger, time.Now)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	require.NoError(t, status.check(ctx))
	assert.False(t, pinger.canceled)
	assert.True(t, pinger.hasDeadline)
}
