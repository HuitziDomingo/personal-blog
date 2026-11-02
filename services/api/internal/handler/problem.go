package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const problemContentType = "application/problem+json"

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
func handlerError(c *gin.Context, err error) {
	if errors.Is(err, errNotImplemented) {
		writeProblem(c, http.StatusNotImplemented, "")

		return
	}

	internalError(c, err)
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
