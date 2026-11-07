// Package logging crea el logger de la API: texto legible en local o JSON con
// los campos que entiende Cloud Logging en producción.
package logging

import (
	"io"
	"log/slog"
)

// Format es el formato de salida del logger.
type Format string

const (
	// Text escribe key=value, legible en una terminal.
	Text Format = "text"
	// JSON escribe una línea JSON por evento para Cloud Logging.
	JSON Format = "json"
)

// New crea un logger que escribe en w con el formato pedido.
func New(w io.Writer, format Format) *slog.Logger {
	if format == JSON {
		return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{ReplaceAttr: cloudLogging}))
	}

	return slog.New(slog.NewTextHandler(w, nil))
}

// cloudLogging renombra los campos de nivel y mensaje a los que Cloud Logging
// reconoce en un log estructurado: severity y message. time ya lo reconoce.
// Solo toca los atributos de primer nivel, no los de un grupo.
func cloudLogging(groups []string, attr slog.Attr) slog.Attr {
	if len(groups) > 0 {
		return attr
	}

	switch attr.Key {
	case slog.LevelKey:
		level, _ := attr.Value.Any().(slog.Level)

		return slog.String("severity", Severity(level))
	case slog.MessageKey:
		return slog.Attr{Key: "message", Value: attr.Value}
	default:
		return attr
	}
}

// Severity traduce un nivel de slog a los nombres de Cloud Logging.
func Severity(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "ERROR"
	case level >= slog.LevelWarn:
		return "WARNING"
	case level >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}
