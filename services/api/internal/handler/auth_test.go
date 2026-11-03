package handler

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	testEmail        = "admin@huitzi.xyz"
	testPassword     = "correct-horse-battery"
	testAccessToken  = "valid-access-token"
	testRefreshToken = "valid-refresh-token"
	newAccessToken   = "new-access-token"
	newRefreshToken  = "new-refresh-token"
	reusedRefresh    = "reused-refresh-token"
)

var testUser = &domain.User{ID: "user-1", Email: testEmail, Role: domain.UserRoleAdmin}

// fakeSessions simula el service: acepta testPassword, testAccessToken y
// testRefreshToken, y registra los refresh tokens que recibe.
type fakeSessions struct {
	mu        sync.Mutex
	loginErr  error
	logoutErr error
	userErr   error
	loggedOut []string
}

func newFakeSessions() *fakeSessions {
	return &fakeSessions{}
}

func (f *fakeSessions) Login(_ context.Context, email, password string) (*domain.User, service.Session, error) {
	if f.loginErr != nil {
		return nil, service.Session{}, f.loginErr
	}

	if email != testEmail || password != testPassword {
		return nil, service.Session{}, domain.ErrInvalidCredentials
	}

	return testUser, service.Session{AccessToken: newAccessToken, RefreshToken: newRefreshToken}, nil
}

func (f *fakeSessions) Refresh(_ context.Context, refreshToken string) (service.Session, error) {
	switch refreshToken {
	case testRefreshToken:
		return service.Session{AccessToken: newAccessToken, RefreshToken: newRefreshToken}, nil
	case reusedRefresh:
		return service.Session{}, domain.ErrTokenReused
	default:
		return service.Session{}, domain.ErrInvalidToken
	}
}

func (f *fakeSessions) Logout(_ context.Context, refreshToken string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.loggedOut = append(f.loggedOut, refreshToken)

	return f.logoutErr
}

func (f *fakeSessions) Authenticate(accessToken string) (service.AccessClaims, error) {
	if accessToken != testAccessToken {
		return service.AccessClaims{}, domain.ErrInvalidToken
	}

	return service.AccessClaims{UserID: testUser.ID, Role: testUser.Role}, nil
}

func (f *fakeSessions) CurrentUser(_ context.Context, userID string) (*domain.User, error) {
	if f.userErr != nil {
		return nil, f.userErr
	}

	if userID != testUser.ID {
		return nil, domain.ErrInvalidToken
	}

	return testUser, nil
}

func sessionRouter(t *testing.T, sessions *fakeSessions) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.Sessions = sessions

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	router, err := NewRouter(&fakePinger{}, spec, cfg)
	require.NoError(t, err)

	return router
}

// withCookies arma la cabecera Cookie que manda el navegador.
func withCookies(cookies ...string) map[string]string {
	return map[string]string{"Cookie": strings.Join(cookies, "; ")}
}

func accessCookie(value string) string {
	return accessCookieName + "=" + value
}

func refreshCookie(value string) string {
	return refreshCookieName + "=" + value
}

const (
	wantAccessCookie   = "access_token=new-access-token; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict"
	wantRefreshCookie  = "refresh_token=new-refresh-token; Path=/api/v1/auth; Max-Age=604800; HttpOnly; Secure; SameSite=Strict"
	clearAccessCookie  = "access_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
	clearRefreshCookie = "refresh_token=; Path=/api/v1/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
)

func loginRequest(email, password string) string {
	return `{"email":"` + email + `","password":"` + password + `"}`
}

func TestLoginSetsSessionCookies(t *testing.T) {
	response := send(sessionRouter(t, newFakeSessions()), http.MethodPost, loginPath, loginRequest(testEmail, testPassword), nil)

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"id":"user-1","email":"admin@huitzi.xyz","role":"admin"}`, response.Body.String())
	assert.Equal(t, []string{wantAccessCookie, wantRefreshCookie}, response.Header().Values("Set-Cookie"))
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
}

func TestLoginErrors(t *testing.T) {
	tests := []struct {
		name       string
		loginErr   error
		password   string
		status     int
		detail     string
		retryAfter string
	}{
		{name: "invalid credentials", password: "wrong-password", status: http.StatusUnauthorized, detail: detailLoginFailed},
		{name: "too many attempts", loginErr: &service.TooManyAttemptsError{RetryAfter: 90*time.Second + time.Millisecond}, password: testPassword, status: http.StatusTooManyRequests, detail: detailTooManyAttempts, retryAfter: "91"},
		{name: "repository failure", loginErr: errors.New("database down"), password: testPassword, status: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()
			sessions.loginErr = tt.loginErr

			response := send(sessionRouter(t, sessions), http.MethodPost, loginPath, loginRequest(testEmail, tt.password), nil)

			problem := requireProblem(t, response, tt.status)
			if tt.detail != "" {
				assert.Equal(t, tt.detail, *problem.Detail)
			}

			assert.Equal(t, tt.retryAfter, response.Header().Get("Retry-After"))
			assert.Empty(t, response.Header().Values("Set-Cookie"))
		})
	}
}

func TestCurrentUser(t *testing.T) {
	tests := []struct {
		name    string
		cookies map[string]string
		userErr error
		status  int
		cleared bool
	}{
		{name: "valid session", cookies: withCookies(accessCookie(testAccessToken)), status: http.StatusOK},
		{name: "without cookie", status: http.StatusUnauthorized},
		{name: "invalid token", cookies: withCookies(accessCookie("forged")), status: http.StatusUnauthorized},
		{name: "refresh token is not an access token", cookies: withCookies(refreshCookie(testRefreshToken)), status: http.StatusUnauthorized},
		{name: "deleted user", cookies: withCookies(accessCookie(testAccessToken)), userErr: domain.ErrInvalidToken, status: http.StatusUnauthorized, cleared: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()
			sessions.userErr = tt.userErr

			response := send(sessionRouter(t, sessions), http.MethodGet, "/api/v1/auth/me", "", tt.cookies)

			if tt.status == http.StatusOK {
				require.Equal(t, http.StatusOK, response.Code)
				assert.JSONEq(t, `{"id":"user-1","email":"admin@huitzi.xyz","role":"admin"}`, response.Body.String())

				return
			}

			requireProblem(t, response, tt.status)

			if tt.cleared {
				assert.Equal(t, []string{clearAccessCookie, clearRefreshCookie}, response.Header().Values("Set-Cookie"))
			}
		})
	}
}

func TestProtectedRouteAcceptsValidSession(t *testing.T) {
	router := sessionRouter(t, newFakeSessions())

	withSession := send(router, http.MethodGet, "/api/v1/admin/posts", "", withCookies(accessCookie(testAccessToken)))
	forged := send(router, http.MethodGet, "/api/v1/admin/posts", "", withCookies(accessCookie("forged")))

	// La operación aún no existe: 501 significa que pasó la autenticación.
	requireProblem(t, withSession, http.StatusNotImplemented)
	problem := requireProblem(t, forged, http.StatusUnauthorized)
	assert.Equal(t, "authentication required", *problem.Detail)
}

func TestRefreshRotatesCookies(t *testing.T) {
	response := send(sessionRouter(t, newFakeSessions()), http.MethodPost, refreshPath, "", withCookies(refreshCookie(testRefreshToken)))

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Equal(t, []string{wantAccessCookie, wantRefreshCookie}, response.Header().Values("Set-Cookie"))
}

func TestRefreshRejectsUnusableTokens(t *testing.T) {
	for _, token := range []string{"unknown", reusedRefresh} {
		t.Run(token, func(t *testing.T) {
			response := send(sessionRouter(t, newFakeSessions()), http.MethodPost, refreshPath, "", withCookies(refreshCookie(token)))

			problem := requireProblem(t, response, http.StatusUnauthorized)
			assert.Equal(t, detailInvalidSession, *problem.Detail)
			assert.Equal(t, []string{clearAccessCookie, clearRefreshCookie}, response.Header().Values("Set-Cookie"))
		})
	}
}

func TestLogout(t *testing.T) {
	tests := []struct {
		name    string
		cookies map[string]string
		revoked []string
	}{
		{name: "with session", cookies: withCookies(accessCookie(testAccessToken), refreshCookie(testRefreshToken)), revoked: []string{testRefreshToken}},
		{name: "without cookie", revoked: []string{""}},
		{name: "unknown token", cookies: withCookies(refreshCookie("unknown")), revoked: []string{"unknown"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()

			response := send(sessionRouter(t, sessions), http.MethodPost, "/api/v1/auth/logout", "", tt.cookies)

			require.Equal(t, http.StatusNoContent, response.Code)
			assert.Equal(t, []string{clearAccessCookie, clearRefreshCookie}, response.Header().Values("Set-Cookie"))
			assert.Equal(t, tt.revoked, sessions.loggedOut)
		})
	}
}

func TestLogoutFailureIsAnInternalError(t *testing.T) {
	sessions := newFakeSessions()
	sessions.logoutErr = errors.New("database down")

	response := send(sessionRouter(t, sessions), http.MethodPost, "/api/v1/auth/logout", "", withCookies(refreshCookie(testRefreshToken)))

	requireProblem(t, response, http.StatusInternalServerError)
}

func TestNewRouterRequiresSessions(t *testing.T) {
	cfg := testRouterConfig()
	cfg.Sessions = nil

	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.Error(t, err)
}

// TestAuthLogsDoNotLeakSecrets recorre los flujos de sesión, incluidos los
// errores, y comprueba que ni el log de acceso ni slog registran tokens,
// cookies, emails o contraseñas.
func TestAuthLogsDoNotLeakSecrets(t *testing.T) {
	var logs bytes.Buffer

	previousLogger := slog.Default()
	previousWriter := gin.DefaultWriter
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	gin.DefaultWriter = &logs
	t.Cleanup(func() {
		slog.SetDefault(previousLogger)
		gin.DefaultWriter = previousWriter
	})

	sessions := newFakeSessions()
	router := sessionRouter(t, sessions)

	send(router, http.MethodPost, loginPath, loginRequest(testEmail, testPassword), nil)
	send(router, http.MethodPost, loginPath, loginRequest(testEmail, "wrong-password"), nil)
	send(router, http.MethodGet, "/api/v1/auth/me", "", withCookies(accessCookie(testAccessToken)))
	send(router, http.MethodPost, refreshPath, "", withCookies(refreshCookie(testRefreshToken)))
	send(router, http.MethodPost, refreshPath, "", withCookies(refreshCookie(reusedRefresh)))

	sessions.loginErr = errors.New("database down")
	sessions.logoutErr = errors.New("database down")
	send(router, http.MethodPost, loginPath, loginRequest(testEmail, testPassword), nil)
	send(router, http.MethodPost, "/api/v1/auth/logout", "", withCookies(refreshCookie(testRefreshToken)))

	output := logs.String()
	require.Contains(t, output, "refresh token reuse detected", "the capture works")

	for _, secret := range []string{testEmail, testPassword, "wrong-password", testAccessToken, testRefreshToken, reusedRefresh, newAccessToken, newRefreshToken, accessCookieName, refreshCookieName} {
		assert.NotContains(t, output, secret)
	}
}
