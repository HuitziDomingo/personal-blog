package domain

import (
	"context"
	"errors"
)

// Errores del almacenamiento de archivos. Los dos se responden con 503.
var (
	// ErrFileStorageDisabled indica que la API arrancó sin almacenamiento de
	// archivos configurado: no hay dónde guardar lo que se sube.
	ErrFileStorageDisabled = errors.New("file storage is not configured")

	// ErrFileStorageUnavailable indica que el almacenamiento falló al guardar.
	ErrFileStorageUnavailable = errors.New("file storage is unavailable")
)

// StoredFile es un archivo para guardar: su clave dentro del almacén, generada
// por la API, sus cabeceras y sus bytes, ya verificados.
type StoredFile struct {
	Key         string
	ContentType string
	// ContentDisposition se sirve con el archivo. Con attachment, el
	// navegador lo descarga en vez de abrirlo en el origen del almacén.
	ContentDisposition string
	Data               []byte
}

// FileStore es el puerto del almacenamiento de archivos públicos (ADR-026,
// punto 3, y ADR-028, punto 5): GCS en producción y un directorio en
// desarrollo. Put guarda el archivo y devuelve su URL pública, que es de otro
// origen que la web y el admin. Guardar dos veces la misma clave no es un
// error: la clave incluye el hash de los bytes.
type FileStore interface {
	Put(ctx context.Context, file StoredFile) (string, error)
}
