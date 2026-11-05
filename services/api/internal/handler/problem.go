package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	problemContentType = "application/problem+json"

	detailLoginFailed     = "invalid credentials"
	detailInvalidSession  = "invalid or expired session"
	detailTooManyAttempts = "too many login attempts"
	detailInvalidPost     = "invalid post data"
	detailDuplicateSlug   = "slug already exists"
	detailSlugLocked      = "slug cannot change once the post has been published"
)

// errNotImplemented marca las operaciones del contrato que aún no existen.
var errNotImplemented = errors.New("operation not implemented")

// writeProblem responde con un error RFC 9457 y detiene la cadena de handlers.
// Sin type, el problema es about:blank y title repite la frase del estado.
func writeProblem(c *gin.Context, status int, detail string) {
	c.Abort()

	title := http.StatusText(status)
	code := int32(status) //nolint:gosec // Los estados HTTP caben en int32.
	problem := gen.Problem{Status: &code, Title: &title}
	if detail != "" {
		problem.Detail = &detail
	}

	body, err := json.Marshal(problem)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "encode problem failed", "error", err)
		c.Status(http.StatusInternalServerError)

		return
	}

	c.Data(status, problemContentType, body)
}

// routeNotFound responde a las rutas que no existen.
func routeNotFound(c *gin.Context) {
	writeProblem(c, http.StatusNotFound, "")
}

// recovered responde a los panic que llegan a la recuperación de Gin.
func recovered(c *gin.Context, value any) {
	internalError(c, fmt.Errorf("panic: %v", value))
}

// bindError responde a los parámetros que no se pueden convertir a su tipo.
func bindError(c *gin.Context, err error, status int) {
	slog.WarnContext(c.Request.Context(), "invalid parameter", "error", err)
	writeProblem(c, status, detailInvalidParameter)
}

// requestError responde a los cuerpos que strict-server no puede decodificar.
func requestError(c *gin.Context, err error) {
	slog.WarnContext(c.Request.Context(), "invalid request body", "error", err)
	writeProblem(c, http.StatusBadRequest, detailInvalidBody)
}

// handlerError responde a los errores que devuelven las operaciones.
// Los errores del login y la sesión se traducen a 401 o 429 sin decir el
// motivo concreto. Los del dominio de posts, a 400, 403, 404 o 409.
func handlerError(c *gin.Context, err error) {
	var tooMany *service.TooManyAttemptsError

	switch {
	case errors.Is(err, errNotImplemented):
		writeProblem(c, http.StatusNotImplemented, "")
	case errors.As(err, &tooMany):
		c.Header("Retry-After", strconv.Itoa(retryAfterSeconds(tooMany.RetryAfter)))
		writeProblem(c, http.StatusTooManyRequests, detailTooManyAttempts)
	case errors.Is(err, domain.ErrInvalidCredentials):
		writeProblem(c, http.StatusUnauthorized, detailLoginFailed)
	case errors.Is(err, domain.ErrTokenReused):
		// Sin datos del usuario ni del token: solo deja constancia del evento.
		slog.WarnContext(c.Request.Context(), "refresh token reuse detected, session family revoked")
		invalidSession(c)
	case errors.Is(err, domain.ErrInvalidToken):
		invalidSession(c)
	case errors.Is(err, domain.ErrForbidden):
		writeProblem(c, http.StatusForbidden, "")
	case errors.Is(err, domain.ErrNotFound):
		writeProblem(c, http.StatusNotFound, "")
	case errors.Is(err, domain.ErrDuplicateSlug):
		writeProblem(c, http.StatusConflict, detailDuplicateSlug)
	case errors.Is(err, domain.ErrSlugLocked):
		writeProblem(c, http.StatusConflict, detailSlugLocked)
	case errors.Is(err, domain.ErrInvalidInput):
		// El validador del contrato ya rechazó casi todo; aquí llegan las reglas
		// del service, como un título sin caracteres para el slug.
		writeProblem(c, http.StatusBadRequest, detailInvalidPost)
	default:
		internalError(c, err)
	}
}

// invalidSession borra las cookies de una sesión que ya no vale y responde 401.
func invalidSession(c *gin.Context) {
	addCookies(c.Writer, clearedCookies())
	writeProblem(c, http.StatusUnauthorized, detailInvalidSession)
}

// responseError responde a los fallos al serializar una respuesta.
func responseError(c *gin.Context, err error) {
	internalError(c, err)
}

// internalError registra el error y no expone su detalle al cliente. Si la
// respuesta ya empezó a enviarse, no se puede cambiar su estado.
func internalError(c *gin.Context, err error) {
	slog.ErrorContext(c.Request.Context(), "request failed", "error", err)

	if c.Writer.Written() {
		c.Abort()

		return
	}

	writeProblem(c, http.StatusInternalServerError, "")
}
