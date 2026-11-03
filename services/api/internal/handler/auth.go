package handler

import (
	"context"
	"net/http"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

// server implementa el contrato. Las operaciones que aún no existen vienen de
// unimplementedServer; los métodos de server tienen prioridad sobre los
// promovidos.
type server struct {
	unimplementedServer

	sessions Sessions
}

var _ gen.StrictServerInterface = server{}

// Login comprueba las credenciales y fija las cookies de sesión.
func (s server) Login(ctx context.Context, request gen.LoginRequestObject) (gen.LoginResponseObject, error) {
	user, session, err := s.sessions.Login(ctx, string(request.Body.Email), request.Body.Password)
	if err != nil {
		return nil, err
	}

	return loginResponse{user: toUser(user), cookies: sessionCookies(session)}, nil
}

// RefreshSession rota el refresh token de la cookie.
func (s server) RefreshSession(ctx context.Context, _ gen.RefreshSessionRequestObject) (gen.RefreshSessionResponseObject, error) {
	session, err := s.sessions.Refresh(ctx, refreshTokenFrom(ctx))
	if err != nil {
		return nil, err
	}

	return refreshResponse{cookies: sessionCookies(session)}, nil
}

// Logout revoca la sesión, si hay cookie, y borra las cookies.
func (s server) Logout(ctx context.Context, _ gen.LogoutRequestObject) (gen.LogoutResponseObject, error) {
	if err := s.sessions.Logout(ctx, refreshTokenFrom(ctx)); err != nil {
		return nil, err
	}

	return logoutResponse{}, nil
}

// GetCurrentUser devuelve el usuario de la sesión. El validador ya exigió un
// access token válido.
func (s server) GetCurrentUser(ctx context.Context, _ gen.GetCurrentUserRequestObject) (gen.GetCurrentUserResponseObject, error) {
	claims, ok := claimsFrom(ctx)
	if !ok {
		return nil, domain.ErrInvalidToken
	}

	user, err := s.sessions.CurrentUser(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}

	return gen.GetCurrentUser200JSONResponse(toUser(user)), nil
}

func toUser(user *domain.User) gen.User {
	return gen.User{
		Id:    user.ID,
		Email: openapi_types.Email(user.Email),
		Role:  gen.UserRole(user.Role),
	}
}

// Las respuestas generadas solo admiten una cabecera Set-Cookie. Estos tipos
// agregan las dos cookies y delegan el resto en el tipo generado.
type (
	loginResponse struct {
		user    gen.User
		cookies []string
	}
	refreshResponse struct {
		cookies []string
	}
	logoutResponse struct{}
)

func (r loginResponse) VisitLoginResponse(w http.ResponseWriter) error {
	addCookies(w, r.cookies)

	return gen.Login200JSONResponse{Body: r.user}.VisitLoginResponse(w)
}

func (r refreshResponse) VisitRefreshSessionResponse(w http.ResponseWriter) error {
	addCookies(w, r.cookies)

	return gen.RefreshSession204Response{}.VisitRefreshSessionResponse(w)
}

func (logoutResponse) VisitLogoutResponse(w http.ResponseWriter) error {
	addCookies(w, clearedCookies())

	return gen.Logout204Response{}.VisitLogoutResponse(w)
}
