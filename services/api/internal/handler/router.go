// Package handler expone la API por HTTP con Gin.
package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gin-gonic/gin"
	ginmiddleware "github.com/oapi-codegen/gin-middleware"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const readyTimeout = 2 * time.Second

// Pinger comprueba que una dependencia externa está disponible.
type Pinger interface {
	Ping(ctx context.Context) error
}

// NewRouter crea el router HTTP con las rutas de la API. spec debe venir de
// LoadSpec: el validador hace panic si no puede construir su router.
func NewRouter(pinger Pinger, spec *openapi3.T) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.CustomRecovery(recovered))
	router.NoRoute(routeNotFound)
	router.GET("/health", health)
	router.GET("/ready", ready(pinger))

	validator := ginmiddleware.OapiRequestValidatorWithOptions(spec, &ginmiddleware.Options{
		ErrorHandler:      validationError,
		MultiErrorHandler: describeViolations,
		Options:           openapi3filter.Options{MultiError: true},
	})
	server := gen.NewStrictHandlerWithOptions(unimplementedServer{}, nil, gen.StrictGinServerOptions{
		RequestErrorHandlerFunc:  requestError,
		HandlerErrorFunc:         handlerError,
		ResponseErrorHandlerFunc: responseError,
	})
	gen.RegisterHandlersWithOptions(router.Group("/", validator), server, gen.GinServerOptions{
		ErrorHandler: bindError,
	})

	return router
}

// health es la comprobación de liveness; no consulta dependencias externas.
func health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ready es la comprobación de readiness; responde 503 si la base de datos no
// está disponible.
func ready(pinger Pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), readyTimeout)
		defer cancel()

		if err := pinger.Ping(ctx); err != nil {
			slog.ErrorContext(ctx, "readiness check failed", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})

			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}
