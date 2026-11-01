// Package handler expone la API por HTTP con Gin.
package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const readyTimeout = 2 * time.Second

// Pinger comprueba que una dependencia externa está disponible.
type Pinger interface {
	Ping(ctx context.Context) error
}

// NewRouter crea el router HTTP con las rutas de la API.
func NewRouter(pinger Pinger) *gin.Engine {
	router := gin.Default()
	router.GET("/health", health)
	router.GET("/ready", ready(pinger))

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
