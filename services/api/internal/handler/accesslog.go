package handler

import (
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// AccessLog registra cada petición con slog. Con el handler JSON de
// internal/logging, el grupo httpRequest es el que Cloud Logging muestra como
// petición HTTP. No registra cabeceras, cookies ni cuerpos.
func AccessLog(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		// Antes de c.Next(): el validador del contrato agrega a la URL los
		// valores por defecto de la query, y el log debe mostrar lo que pidió
		// el cliente.
		requestURI := c.Request.URL.RequestURI()
		c.Next()

		status := c.Writer.Status()
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		}

		logger.LogAttrs(c.Request.Context(), level, "request",
			slog.Group("httpRequest",
				slog.String("requestMethod", c.Request.Method),
				slog.String("requestUrl", requestURI),
				slog.Int("status", status),
				slog.String("responseSize", strconv.Itoa(max(c.Writer.Size(), 0))),
				slog.String("userAgent", c.Request.UserAgent()),
				slog.String("remoteIp", c.ClientIP()),
				slog.String("protocol", c.Request.Proto),
				slog.String("latency", fmt.Sprintf("%.6fs", time.Since(start).Seconds())),
			),
		)
	}
}

// SetMode fija el modo de Gin (debug, release o test) antes de crear el router.
func SetMode(mode string) {
	gin.SetMode(mode)
}
