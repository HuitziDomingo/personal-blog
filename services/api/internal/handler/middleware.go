package handler

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	authPathPrefix  = "/api/v1/auth/"
	adminPathPrefix = "/api/v1/admin/"

	hstsPolicy            = "max-age=31536000; includeSubDomains"
	contentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'"

	corsAllowedMethods = "GET, POST, PUT, PATCH, DELETE"
	corsAllowedHeaders = "Content-Type"
	// Retry-After no es una cabecera CORS-safelisted: sin exponerla, el navegador
	// se la oculta a un frontend de otro origen (el admin la muestra en los 429).
	corsExposedHeaders = "Retry-After"
	corsPreflightCache = 10 * time.Minute

	detailBodyTooLarge    = "request body too large"
	detailOriginForbidden = "origin not allowed"
)

// securityHeaders agrega las cabeceras de ADR-010 a toda respuesta.
func securityHeaders(c *gin.Context) {
	header := c.Writer.Header()
	header.Set("Strict-Transport-Security", hstsPolicy)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Content-Security-Policy", contentSecurityPolicy)

	// Las respuestas con sesión o con borradores no se guardan en ninguna caché.
	if strings.HasPrefix(c.Request.URL.Path, authPathPrefix) || strings.HasPrefix(c.Request.URL.Path, adminPathPrefix) {
		header.Set("Cache-Control", "no-store")
	}
}

// limitBody lee el cuerpo completo con un tope. Leerlo aquí da un 413 sin
// importar si la petición declara Content-Length o llega por chunks; más
// adelante, el validador convertiría el error en un 400.
func limitBody(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body == nil || c.Request.Body == http.NoBody {
			return
		}

		body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes))

		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeProblem(c, http.StatusRequestEntityTooLarge, detailBodyTooLarge)

			return
		}

		if err != nil {
			slog.WarnContext(c.Request.Context(), "read request body failed", "error", err)
			writeProblem(c, http.StatusBadRequest, detailInvalidBody)

			return
		}

		c.Request.Body = io.NopCloser(bytes.NewReader(body))
	}
}

// crossOrigin aplica CORS y rechaza los métodos que cambian estado desde un
// Origin ajeno. Sin Origin no hay navegador, así que no aplica ninguna de las dos
// cosas (ADR-011).
func crossOrigin(allowedOrigins []string) gin.HandlerFunc {
	maxAge := strconv.Itoa(int(corsPreflightCache.Seconds()))

	return func(c *gin.Context) {
		header := c.Writer.Header()
		header.Add("Vary", "Origin")

		origin := c.GetHeader("Origin")
		if origin == "" {
			return
		}

		allowed := slices.Contains(allowedOrigins, origin)
		preflight := isPreflight(c.Request)

		if !allowed {
			if preflight || changesState(c.Request.Method) {
				writeProblem(c, http.StatusForbidden, detailOriginForbidden)
			}

			return
		}

		header.Set("Access-Control-Allow-Origin", origin)
		header.Set("Access-Control-Allow-Credentials", "true")
		header.Set("Access-Control-Expose-Headers", corsExposedHeaders)

		if preflight {
			header.Set("Access-Control-Allow-Methods", corsAllowedMethods)
			header.Set("Access-Control-Allow-Headers", corsAllowedHeaders)
			header.Set("Access-Control-Max-Age", maxAge)
			c.AbortWithStatus(http.StatusNoContent)
		}
	}
}

func isPreflight(request *http.Request) bool {
	return request.Method == http.MethodOptions && request.Header.Get("Access-Control-Request-Method") != ""
}

func changesState(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}
