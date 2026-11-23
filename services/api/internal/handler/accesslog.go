package handler

import (
	"fmt"
	"log/slog"
	"net/netip"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// AccessLog registra cada petición con slog. Con el handler JSON de
// internal/logging, el grupo httpRequest es el que Cloud Logging muestra como
// petición HTTP. No registra cabeceras, cookies ni cuerpos, y la IP va
// truncada (anonymizeIP): los logs no guardan datos personales.
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
				slog.String("remoteIp", anonymizeIP(c.ClientIP())),
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

// Prefijos que se conservan de la IP del cliente en los logs: /24 en IPv4 y
// /48 en IPv6. Bastan para ver de qué red llega un abuso (y cruzarlo con los
// 429 del rate limit, que sí usa la IP completa, solo en memoria) sin guardar
// la dirección de una persona.
const (
	anonymousIPv4Bits = 24
	anonymousIPv6Bits = 48
)

// anonymizeIP pone en cero la parte de host de la IP: 203.0.113.57 queda en
// 203.0.113.0 y 2001:db8:1234:5678::1 en 2001:db8:1234::. Lo que no es una IP
// queda vacío.
func anonymizeIP(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ""
	}

	addr = addr.Unmap()
	bits := anonymousIPv6Bits
	if addr.Is4() {
		bits = anonymousIPv4Bits
	}

	prefix, err := addr.WithZone("").Prefix(bits)
	if err != nil {
		return ""
	}

	return prefix.Addr().String()
}
