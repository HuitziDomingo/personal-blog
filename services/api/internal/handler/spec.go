package handler

import (
	"context"
	"fmt"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/routers/gorillamux"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

// LoadSpec carga el contrato embebido y comprueba que es válido.
func LoadSpec(ctx context.Context) (*openapi3.T, error) {
	spec, err := gen.GetSpec()
	if err != nil {
		return nil, fmt.Errorf("load openapi spec: %w", err)
	}

	if err := validateSpec(ctx, spec); err != nil {
		return nil, err
	}

	return spec, nil
}

// validateSpec construye también el router, porque es el paso que hace fallar
// con panic al middleware de validación de Gin.
func validateSpec(ctx context.Context, spec *openapi3.T) error {
	if err := spec.Validate(ctx); err != nil {
		return fmt.Errorf("validate openapi spec: %w", err)
	}

	if _, err := gorillamux.NewRouter(spec); err != nil {
		return fmt.Errorf("build openapi router: %w", err)
	}

	return nil
}
