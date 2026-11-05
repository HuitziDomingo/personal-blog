// Package handler expone la API por HTTP con Gin.
package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/gin-gonic/gin"
	ginmiddleware "github.com/oapi-codegen/gin-middleware"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

// Pinger comprueba que una dependencia externa está disponible.
type Pinger interface {
	Ping(ctx context.Context) error
}

// RouterConfig son los ajustes HTTP de la API.
type RouterConfig struct {
	AllowedOrigins []string
	MaxBodyBytes   int64
	RateLimits     RateLimits
	// TrustedProxies es el rango del par directo; vacío, la IP es la del socket.
	TrustedProxies []string
	// Sessions implementa el login y la sesión; es obligatorio.
	Sessions Sessions
	// Posts implementa los posts; es obligatorio.
	Posts Posts
}

// NewRouter crea el router HTTP con las rutas de la API. spec debe venir de
// LoadSpec: el validador hace panic si no puede construir su router.
//
// Orden de la cadena: logger → recovery → cabeceras → CORS/Origin → rate limit
// → límite de cuerpo → lectura de la sesión → validador del contrato → handlers.
func NewRouter(pinger Pinger, spec *openapi3.T, cfg RouterConfig) (*gin.Engine, error) {
	if cfg.Sessions == nil {
		return nil, errors.New("router needs sessions")
	}

	if cfg.Posts == nil {
		return nil, errors.New("router needs posts")
	}

	router := gin.New()
	// strict-server pasa el *gin.Context como context.Context a los handlers.
	// Con esto, Value, Done y Deadline consultan también el de la petición, que
	// es donde readSession deja los claims.
	router.ContextWithFallback = true
	if err := configureClientIP(router, cfg.TrustedProxies); err != nil {
		return nil, err
	}

	router.Use(
		gin.Logger(),
		gin.CustomRecovery(recovered),
		securityHeaders,
		crossOrigin(cfg.AllowedOrigins),
		newRateLimiter(cfg.RateLimits, time.Now).handle,
		limitBody(cfg.MaxBodyBytes),
	)
	router.NoRoute(routeNotFound)
	router.GET("/health", health)
	router.GET("/ready", ready(newReadiness(pinger, time.Now)))

	validator := ginmiddleware.OapiRequestValidatorWithOptions(spec, &ginmiddleware.Options{
		ErrorHandler:      validationError,
		MultiErrorHandler: describeViolations,
		Options: openapi3filter.Options{
			MultiError:         true,
			AuthenticationFunc: authenticateRequest,
		},
	})
	handlers := gen.NewStrictHandlerWithOptions(server{sessions: cfg.Sessions, posts: cfg.Posts}, nil, gen.StrictGinServerOptions{
		RequestErrorHandlerFunc:  requestError,
		HandlerErrorFunc:         handlerError,
		ResponseErrorHandlerFunc: responseError,
	})
	gen.RegisterHandlersWithOptions(router.Group("/", readSession(cfg.Sessions), validator), handlers, gen.GinServerOptions{
		ErrorHandler: bindError,
	})

	return router, nil
}

// configureClientIP hace que ClientIP solo lea X-Forwarded-For si la conexión
// viene de un proxy de confianza (ADR-011).
func configureClientIP(router *gin.Engine, trustedProxies []string) error {
	router.RemoteIPHeaders = []string{"X-Forwarded-For"}

	if len(trustedProxies) == 0 {
		trustedProxies = nil
	}

	if err := router.SetTrustedProxies(trustedProxies); err != nil {
		return fmt.Errorf("set trusted proxies: %w", err)
	}

	return nil
}

// health es la comprobación de liveness; no consulta dependencias externas.
func health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ready es la comprobación de readiness; responde 503 si la base de datos no
// está disponible.
func ready(status *readiness) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := status.check(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})

			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}
