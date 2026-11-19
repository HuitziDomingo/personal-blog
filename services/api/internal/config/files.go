package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

// Almacenes de archivos (FILES_STORE).
const (
	// FilesStoreNone es el valor por defecto: sin almacén, subir el CV
	// responde 503 y el resto de la API funciona.
	FilesStoreNone = ""
	// FilesStoreLocal es un directorio servido por la API en /media/, solo
	// para desarrollo.
	FilesStoreLocal = "local"
	// filesStoreGCS es el bucket de producción (ADR-026 y ADR-028). Su
	// adaptador llega con BLOG-112; mientras, la API no arranca con él.
	filesStoreGCS = "gcs"
)

// Valores por defecto del límite de subidas del CV (ADR-028, punto 4): pocas
// subidas, porque cada una lee hasta 2 MB.
const (
	defaultCVUploadsRateLimitMax           = 10
	defaultCVUploadsRateLimitWindowMinutes = 60
)

// Files es la configuración del almacenamiento de archivos y de las subidas
// del CV.
type Files struct {
	// Store es FilesStoreNone o FilesStoreLocal.
	Store string
	// LocalDir y LocalBaseURL solo se usan con FilesStoreLocal.
	LocalDir     string
	LocalBaseURL string
	// CVUploadsMax subidas del CV por usuario cada CVUploadsWindow.
	CVUploadsMax    int
	CVUploadsWindow time.Duration
}

// loadFiles lee FILES_STORE, FILES_LOCAL_DIR, FILES_LOCAL_BASE_URL,
// RATE_LIMIT_CV_UPLOADS_MAX y RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES.
func loadFiles() (Files, error) {
	maxUploads, err := positiveInt("RATE_LIMIT_CV_UPLOADS_MAX", defaultCVUploadsRateLimitMax)
	if err != nil {
		return Files{}, err
	}

	windowMinutes, err := positiveInt("RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES", defaultCVUploadsRateLimitWindowMinutes)
	if err != nil {
		return Files{}, err
	}

	files := Files{
		Store:           strings.TrimSpace(os.Getenv("FILES_STORE")),
		LocalDir:        strings.TrimSpace(os.Getenv("FILES_LOCAL_DIR")),
		LocalBaseURL:    strings.TrimSpace(os.Getenv("FILES_LOCAL_BASE_URL")),
		CVUploadsMax:    maxUploads,
		CVUploadsWindow: time.Duration(windowMinutes) * time.Minute,
	}

	switch files.Store {
	case FilesStoreNone:
		return files, nil
	case FilesStoreLocal:
		if files.LocalDir == "" || files.LocalBaseURL == "" {
			return Files{}, fmt.Errorf("FILES_STORE=local needs FILES_LOCAL_DIR and FILES_LOCAL_BASE_URL")
		}

		if parsed, err := url.Parse(files.LocalBaseURL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return Files{}, fmt.Errorf("invalid FILES_LOCAL_BASE_URL %q: must be an http or https url", files.LocalBaseURL)
		}

		return files, nil
	case filesStoreGCS:
		return Files{}, fmt.Errorf("FILES_STORE=gcs is not available yet: the GCS adapter arrives with BLOG-112")
	default:
		return Files{}, fmt.Errorf("invalid FILES_STORE %q: must be empty or local", files.Store)
	}
}
