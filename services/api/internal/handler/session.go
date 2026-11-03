package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	accessCookieName  = "access_token"
	refreshCookieName = "refresh_token"
	// refreshCookiePath limita el refresh token a las rutas de autenticación:
	// el navegador no lo manda a ninguna otra.
	refreshCookiePath = "/api/v1/auth"

	accessScheme  = "accessCookie"
	refreshScheme = "refreshCookie"
)

// errUnauthenticated es el motivo que AuthenticationFunc da al validador.
var errUnauthenticated = errors.New("authentication required")

// Sessions es lo que los handlers necesitan del login y la sesión.
type Sessions interface {
	Login(ctx context.Context, email, password string) (*domain.User, service.Session, error)
	Refresh(ctx context.Context, refreshToken string) (service.Session, error)
	Logout(ctx context.Context, refreshToken string) error
	Authenticate(accessToken string) (service.AccessClaims, error)
	CurrentUser(ctx context.Context, userID string) (*domain.User, error)
}

// Claves tipadas del contexto: un tipo propio no choca con claves de otros
// paquetes.
type (
	claimsKey       struct{}
	refreshTokenKey struct{}
)

// readSession lee las cookies de sesión y deja en el contexto de la petición
// los claims de un access token válido y el refresh token en claro. No rechaza
// nada: eso lo hace el validador del contrato con authenticateRequest.
func readSession(sessions Sessions) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		if token, err := c.Cookie(accessCookieName); err == nil && token != "" {
			if claims, err := sessions.Authenticate(token); err == nil {
				ctx = context.WithValue(ctx, claimsKey{}, claims)
			}
		}

		if token, err := c.Cookie(refreshCookieName); err == nil && token != "" {
			ctx = context.WithValue(ctx, refreshTokenKey{}, token)
		}

		c.Request = c.Request.WithContext(ctx)
	}
}

func claimsFrom(ctx context.Context) (service.AccessClaims, bool) {
	claims, ok := ctx.Value(claimsKey{}).(service.AccessClaims)

	return claims, ok
}

func refreshTokenFrom(ctx context.Context) string {
	token, _ := ctx.Value(refreshTokenKey{}).(string)

	return token
}

// authenticateRequest es la AuthenticationFunc del validador: comprueba cada
// esquema de seguridad del contrato con lo que dejó readSession.
func authenticateRequest(_ context.Context, input *openapi3filter.AuthenticationInput) error {
	ctx := input.RequestValidationInput.Request.Context()

	switch input.SecuritySchemeName {
	case accessScheme:
		if _, ok := claimsFrom(ctx); ok {
			return nil
		}
	case refreshScheme:
		if refreshTokenFrom(ctx) != "" {
			return nil
		}
	}

	return errUnauthenticated
}

// sessionCookies fija las dos cookies de una sesión nueva.
func sessionCookies(session service.Session) []string {
	return []string{
		cookie(accessCookieName, session.AccessToken, "/", int(service.AccessTokenTTL/time.Second)),
		cookie(refreshCookieName, session.RefreshToken, refreshCookiePath, int(service.RefreshTokenTTL/time.Second)),
	}
}

// clearedCookies borra las dos cookies. Deben llevar el mismo Path con el que
// se fijaron, o el navegador las trata como cookies distintas.
func clearedCookies() []string {
	return []string{
		cookie(accessCookieName, "", "/", -1),
		cookie(refreshCookieName, "", refreshCookiePath, -1),
	}
}

// cookie arma un Set-Cookie con los atributos de ADR-005. Un maxAge negativo
// produce Max-Age=0, que borra la cookie.
func cookie(name, value, path string, maxAge int) string {
	return (&http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}).String()
}

func addCookies(w http.ResponseWriter, cookies []string) {
	for _, value := range cookies {
		w.Header().Add("Set-Cookie", value)
	}
}
