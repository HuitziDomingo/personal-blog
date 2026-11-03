package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gin-gonic/gin"
)

const (
	detailInvalidParameter = "invalid parameter"
	detailInvalidBody      = "invalid request body"
	detailInvalidRequest   = "invalid request"

	// violationPrefix marca el texto creado por describeViolations. El validador
	// solo entrega un string a su ErrorHandler; lo que no lleve la marca no llega
	// al cliente.
	violationPrefix = "contract violation: "

	// unauthenticatedMarker es lo que describeViolations devuelve si falló la
	// seguridad de la operación; validationError lo convierte en 401.
	unauthenticatedMarker = "contract violation: unauthenticated"
)

// describeViolations convierte los errores tipados del validador en un motivo
// legible, con el campo y la regla que fallaron.
func describeViolations(violations openapi3.MultiError) error {
	// Sin credenciales válidas no se informa de otros errores: el 401 va antes
	// que el 400.
	for _, violation := range violations {
		var security *openapi3filter.SecurityRequirementsError
		if errors.As(violation, &security) {
			return errors.New(unauthenticatedMarker)
		}
	}

	reasons := violationReasons(violations, "", detailInvalidRequest)

	return errors.New(violationPrefix + strings.Join(reasons, "; "))
}

// violationReasons recorre los errores conocidos. Cualquier otro tipo usa
// fallback, para no exponer texto interno de la librería.
func violationReasons(err error, field, fallback string) []string {
	switch e := err.(type) {
	case openapi3.MultiError:
		reasons := make([]string, 0, len(e))
		for _, violation := range e {
			reasons = append(reasons, violationReasons(violation, field, fallback)...)
		}

		return reasons
	case *openapi3filter.RequestError:
		if e.Parameter != nil {
			return violationReasons(e.Err, e.Parameter.Name, detailInvalidParameter)
		}

		return violationReasons(e.Err, "", detailInvalidBody)
	case *openapi3.SchemaError:
		if pointer := strings.Join(e.JSONPointer(), "/"); pointer != "" {
			field = pointer
		}

		return []string{withField(field, e.Reason)}
	default:
		return []string{withField(field, fallback)}
	}
}

func withField(field, reason string) string {
	if field == "" {
		return reason
	}

	return field + ": " + reason
}

// validationError responde a los rechazos del validador del contrato.
func validationError(c *gin.Context, message string, status int) {
	if message == unauthenticatedMarker {
		writeProblem(c, http.StatusUnauthorized, errUnauthenticated.Error())

		return
	}

	detail, ok := strings.CutPrefix(message, violationPrefix)
	if !ok {
		slog.WarnContext(c.Request.Context(), "request rejected", "error", message)
		detail = detailInvalidRequest
	}

	writeProblem(c, status, detail)
}
