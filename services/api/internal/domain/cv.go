package domain

import (
	"bytes"
	"context"
	"errors"
	"time"
)

// MaxCVBytes es el tamaño máximo de un CV en PDF (ADR-028, punto 4).
const MaxCVBytes = 2 << 20 // 2 MiB

// pdfSignature son los bytes con los que empieza todo PDF.
var pdfSignature = []byte("%PDF-")

// Errores del CV. ErrInvalidCVFile se responde con 400 y ErrCVTooLarge con 413.
var (
	ErrInvalidCVFile = errors.New("file must be a PDF")
	ErrCVTooLarge    = errors.New("file is too large")
)

// CVLanguage es el idioma de un CV.
type CVLanguage string

// Idiomas del CV, los mismos del portafolio (ADR-024).
const (
	CVLanguageES CVLanguage = "es"
	CVLanguageEN CVLanguage = "en"
)

// IsValid indica si el idioma pertenece al enum.
func (l CVLanguage) IsValid() bool {
	return l == CVLanguageES || l == CVLanguageEN
}

// CheckCVFile comprueba la firma y el tamaño de un PDF subido. La firma se lee
// de los bytes: la extensión y el Content-Type los decide el cliente.
func CheckCVFile(data []byte) error {
	if len(data) > MaxCVBytes {
		return ErrCVTooLarge
	}

	if !bytes.HasPrefix(data, pdfSignature) {
		return ErrInvalidCVFile
	}

	return nil
}

// CVVersion es una versión subida del CV (ADR-028, puntos 3 y 5).
type CVVersion struct {
	ID         string
	Language   CVLanguage
	Key        string
	URL        string
	Size       int64
	UploadedAt time.Time
	// Current indica si es la vigente de su idioma; hay una como mucho.
	Current bool
}

// CVRepository es el puerto de persistencia de las versiones del CV.
type CVRepository interface {
	// Create guarda la versión, sin marcarla como vigente, y le asigna un ID.
	Create(ctx context.Context, version *CVVersion) error
	// List devuelve hasta limit versiones, de la más reciente a la más antigua.
	List(ctx context.Context, limit int) ([]CVVersion, error)
	// Current devuelve las versiones vigentes, una por idioma como mucho.
	Current(ctx context.Context) ([]CVVersion, error)
	// SetCurrent marca la versión como la vigente de su idioma y desmarca la
	// anterior. Devuelve ErrNotFound si la versión no existe.
	SetCurrent(ctx context.Context, id string) (*CVVersion, error)
}
