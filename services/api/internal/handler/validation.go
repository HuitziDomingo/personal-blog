package handler

import (
	"errors"
	"log/slog"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gin-gonic/gin"
)

const (
	detailInvalidParameter = "parámetro inválido"
	detailInvalidBody      = "cuerpo de la petición inválido"
	detailInvalidRequest   = "petición inválida"

	// violationPrefix marca el texto creado por describeViolations. El validador
	// solo entrega un string a su ErrorHandler; lo que no lleve la marca no llega
	// al cliente.
	violationPrefix = "contract violation: "
)

// describeViolations convierte los errores tipados del validador en un motivo
// legible, con el campo y la regla que fallaron.
func describeViolations(violations openapi3.MultiError) error {
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
	detail, ok := strings.CutPrefix(message, violationPrefix)
	if !ok {
		slog.WarnContext(c.Request.Context(), "request rejected", "error", message)
		detail = detailInvalidRequest
	}

	writeProblem(c, status, detail)
}
