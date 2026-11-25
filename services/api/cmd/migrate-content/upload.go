package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Cabeceras con que la API sube una portada a GCS (internal/files/gcs).
const (
	coverCacheControl       = "public, max-age=31536000, immutable"
	coverContentDisposition = "inline"
)

// uploadResult es lo que pasó con un archivo.
type uploadResult string

const (
	uploaded      uploadResult = "subido"
	alreadyThere  uploadResult = "ya existía: no se sube"
	uploadUnknown uploadResult = "subido o ya existía"
)

// uploader sube un archivo del almacén local al destino.
type uploader interface {
	Upload(ctx context.Context, file upload) (uploadResult, error)
	Describe(key string) string
}

// gcloudUploader sube con gcloud storage cp, con la sesión de gcloud de quien
// corre el comando. --no-clobber no pisa un objeto que ya existe: la clave
// lleva el hash del archivo, así que es el mismo.
type gcloudUploader struct {
	bucket string
}

func (u gcloudUploader) Describe(key string) string {
	return "gs://" + u.bucket + "/" + key
}

func (u gcloudUploader) Upload(ctx context.Context, file upload) (uploadResult, error) {
	// bucket y clave están validados (bucketName y coverKeyPattern), y
	// exec no pasa por una shell.
	cmd := exec.CommandContext(ctx, "gcloud", "storage", "cp", //nolint:gosec // Argumentos validados, sin shell.
		"--no-clobber",
		"--content-type="+file.contentType,
		"--cache-control="+coverCacheControl,
		"--content-disposition="+coverContentDisposition,
		file.path, u.Describe(file.key))

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("gcloud storage cp %s: %w: %s", file.key, err, strings.TrimSpace(string(output)))
	}

	if bytes.Contains(output, []byte("Skipping existing")) {
		return alreadyThere, nil
	}

	if len(bytes.TrimSpace(output)) == 0 {
		return uploadUnknown, nil
	}

	return uploaded, nil
}

// dirUploader copia a un directorio local en lugar del bucket. Solo sirve
// para probar la migración de punta a punta sin GCS.
type dirUploader struct {
	dir string
}

func (u dirUploader) Describe(key string) string {
	return filepath.Join(u.dir, filepath.FromSlash(key))
}

func (u dirUploader) Upload(_ context.Context, file upload) (uploadResult, error) {
	// Rutas bajo directorios locales con claves validadas.
	data, err := os.ReadFile(file.path) //nolint:gosec // Clave validada bajo un directorio local.
	if err != nil {
		return "", fmt.Errorf("leer %s: %w", file.key, err)
	}

	destination := u.Describe(file.key)

	current, err := os.ReadFile(destination) //nolint:gosec // Clave validada bajo un directorio local.
	switch {
	case err == nil && bytes.Equal(current, data):
		return alreadyThere, nil
	case err == nil:
		return "", fmt.Errorf("%s ya existe con otro contenido", destination)
	case !errors.Is(err, os.ErrNotExist):
		return "", fmt.Errorf("leer %s: %w", destination, err)
	}

	if err := os.MkdirAll(filepath.Dir(destination), 0o750); err != nil {
		return "", fmt.Errorf("crear el directorio de %s: %w", file.key, err)
	}

	if err := os.WriteFile(destination, data, 0o600); err != nil { //nolint:gosec // Clave validada bajo un directorio local.
		return "", fmt.Errorf("escribir %s: %w", destination, err)
	}

	return uploaded, nil
}
