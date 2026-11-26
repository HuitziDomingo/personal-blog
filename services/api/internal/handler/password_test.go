package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const testNewPassword = "otra-frase-mas-larga" //nolint:gosec // Contraseña de prueba.

func passwordRequest(current, next string) string {
	return fmt.Sprintf(`{"currentPassword":%q,"newPassword":%q}`, current, next)
}

func TestChangePasswordSetsTheNewSessionCookies(t *testing.T) {
	sessions := newFakeSessions()

	response := send(sessionRouter(t, sessions), http.MethodPost, passwordPath, passwordRequest(testPassword, testNewPassword),
		withCookies(accessCookie(testAccessToken)))

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Empty(t, response.Body.String())
	assert.Equal(t, []string{wantAccessCookie, wantRefreshCookie}, response.Header().Values("Set-Cookie"))
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	assert.Equal(t, []passwordChange{{userID: testUser.ID, current: testPassword, next: testNewPassword}}, sessions.changes)
}

func TestChangePasswordErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		detail string
	}{
		{name: "incorrect current password", err: domain.ErrIncorrectPassword, status: http.StatusBadRequest, detail: "current password is incorrect"},
		{name: "unchanged", err: domain.ErrPasswordUnchanged, status: http.StatusBadRequest, detail: "new password must differ from the current one"},
		{name: "too short", err: domain.ErrPasswordTooShort, status: http.StatusBadRequest, detail: "new password is too short"},
		{name: "too long", err: fmt.Errorf("validate: %w", domain.ErrPasswordTooLong), status: http.StatusBadRequest, detail: "new password is too long"},
		{name: "deleted user", err: domain.ErrInvalidToken, status: http.StatusUnauthorized, detail: detailInvalidSession},
		{name: "repository failure", err: errors.New("database down"), status: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()
			sessions.changeErr = tt.err

			response := send(sessionRouter(t, sessions), http.MethodPost, passwordPath, passwordRequest(testPassword, testNewPassword),
				withCookies(accessCookie(testAccessToken)))

			problem := requireProblem(t, response, tt.status)
			if tt.detail != "" {
				assert.Equal(t, tt.detail, *problem.Detail)
			}

			assert.NotContains(t, response.Body.String(), "database down")
			if tt.status != http.StatusUnauthorized {
				assert.Empty(t, response.Header().Values("Set-Cookie"), "a rejected change keeps the current cookies")
			}
		})
	}
}

func TestChangePasswordValidatesTheContract(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		cookies map[string]string
		status  int
	}{
		{name: "without session", body: passwordRequest(testPassword, testNewPassword), status: http.StatusUnauthorized},
		{name: "forged session", body: passwordRequest(testPassword, testNewPassword), cookies: withCookies(accessCookie("forged")), status: http.StatusUnauthorized},
		{name: "refresh cookie only", body: passwordRequest(testPassword, testNewPassword), cookies: withCookies(refreshCookie(testRefreshToken)), status: http.StatusUnauthorized},
		{name: "13 characters", body: passwordRequest(testPassword, strings.Repeat("a", 13)), cookies: withCookies(accessCookie(testAccessToken)), status: http.StatusBadRequest},
		{name: "73 characters", body: passwordRequest(testPassword, strings.Repeat("a", 73)), cookies: withCookies(accessCookie(testAccessToken)), status: http.StatusBadRequest},
		{name: "empty current", body: passwordRequest("", testNewPassword), cookies: withCookies(accessCookie(testAccessToken)), status: http.StatusBadRequest},
		{name: "missing new", body: `{"currentPassword":"x"}`, cookies: withCookies(accessCookie(testAccessToken)), status: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()

			response := send(sessionRouter(t, sessions), http.MethodPost, passwordPath, tt.body, tt.cookies)

			requireProblem(t, response, tt.status)
			assert.Empty(t, sessions.changes, "the service is never called")
		})
	}
}

func TestChangePasswordHasItsOwnRateLimit(t *testing.T) {
	sessions := newFakeSessions()
	sessions.changeErr = domain.ErrIncorrectPassword

	cfg := testRouterConfig()
	cfg.Sessions = sessions
	cfg.RateLimits.PasswordChanges = WindowLimit{Max: 5, Window: 15 * time.Minute}

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	router, err := NewRouter(&fakePinger{}, spec, cfg)
	require.NoError(t, err)

	attempt := func(cookie string) int {
		return send(router, http.MethodPost, passwordPath, passwordRequest("wrong-password", testNewPassword), withCookies(accessCookie(cookie))).Code
	}

	codes := make([]int, 0, 6)
	for range 6 {
		codes = append(codes, attempt(testAccessToken))
	}

	assert.Equal(t, []int{400, 400, 400, 400, 400, http.StatusTooManyRequests}, codes, "failed attempts count")
	assert.Len(t, sessions.changes, 5)

	limited := send(router, http.MethodPost, passwordPath, passwordRequest("wrong-password", testNewPassword), withCookies(accessCookie(testAccessToken)))
	requireProblem(t, limited, http.StatusTooManyRequests)
	assert.NotEmpty(t, limited.Header().Get("Retry-After"))

	assert.Equal(t, http.StatusBadRequest, attempt(editorAccessToken), "the bucket is per user")

	me := send(router, http.MethodGet, "/api/v1/auth/me", "", withCookies(accessCookie(testAccessToken)))
	assert.Equal(t, http.StatusOK, me.Code, "other routes keep working")
}
