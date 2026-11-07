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
		// Solo la ruta, sin la query: ningún endpoint lleva secretos en la
		// query hoy, pero así un token futuro no acabaría en los logs. Se lee
		// antes de c.Next(), igual que lo pidió el cliente.
		path := c.Request.URL.EscapedPath()
		c.Next()

		status := c.Writer.Status()

		logger.LogAttrs(c.Request.Context(), accessLevel(status), "request",
			slog.Group("httpRequest",
				slog.String("requestMethod", c.Request.Method),
				slog.String("requestUrl", path),
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

// accessLevel elige la severidad de una petición. Los 4xx son WARNING para
// poder filtrar los 403 de Origin y los 429 del rate limit; 401 y 404 quedan en
// INFO porque son rutinarios (el admin pregunta /auth/me sin sesión).
func accessLevel(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status == 401 || status == 404:
		return slog.LevelInfo
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}
