// Package gcs implementa domain.FileStore con Google Cloud Storage (ADR-026,
// punto 9, y ADR-028, punto 5) y el cliente oficial,
// cloud.google.com/go/storage. Un solo bucket guarda las portadas (covers/) y
// los CV (cv/). La autenticación es la de Application Default Credentials: en
// Cloud Run, la cuenta de servicio de la API.
package gcs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"cloud.google.com/go/storage"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// DefaultPublicURL es el dominio desde el que GCS sirve los objetos
	// públicos: otro origen que la web y el admin (ADR-028, punto 6).
	DefaultPublicURL = "https://storage.googleapis.com"

	// cacheControl: la clave lleva el hash del archivo, así que su contenido
	// nunca cambia y se puede cachear un año.
	cacheControl = "public, max-age=31536000, immutable"
)

// bucketPattern son los nombres de bucket sin puntos: de 3 a 63 caracteres,
// minúsculas, dígitos, - y _, empezando y terminando en letra o dígito.
var bucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$`)

// kind es un tipo de archivo que el bucket acepta: el patrón de sus claves y
// los tipos de contenido válidos para ellas.
type kind struct {
	pattern      *regexp.Regexp
	contentTypes []string
}

// kinds son las claves que generan los services. Cualquier otra se rechaza
// antes de llegar a GCS.
var kinds = []kind{
	// cv/<idioma>/<hash>.pdf (ADR-028).
	{pattern: regexp.MustCompile(`^cv/(es|en)/[0-9a-f]{24}\.pdf$`), contentTypes: []string{"application/pdf"}},
	// covers/<post>/<hash>.<ext> (ADR-026): la imagen del proveedor tal cual.
	{pattern: regexp.MustCompile(`^covers/[0-9a-f]{24}/[0-9a-f]{24}\.jpg$`), contentTypes: []string{"image/jpeg"}},
	{pattern: regexp.MustCompile(`^covers/[0-9a-f]{24}/[0-9a-f]{24}\.png$`), contentTypes: []string{"image/png"}},
	{pattern: regexp.MustCompile(`^covers/[0-9a-f]{24}/[0-9a-f]{24}\.webp$`), contentTypes: []string{"image/webp"}},
}

func valid(file domain.StoredFile) bool {
	for _, k := range kinds {
		if !k.pattern.MatchString(file.Key) {
			continue
		}

		for _, contentType := range k.contentTypes {
			if file.ContentType == contentType {
				return true
			}
		}
	}

	return false
}

// Config es la configuración del adaptador.
type Config struct {
	Bucket string
	// PublicURL es DefaultPublicURL si está vacía.
	PublicURL string
	// ClientOptions se pasan a storage.NewClient. En producción van vacías
	// (Application Default Credentials); los tests apuntan a httptest.
	ClientOptions []option.ClientOption
}

// Store sube los archivos al bucket.
type Store struct {
	client    *storage.Client
	bucket    *storage.BucketHandle
	name      string
	publicURL string
}

var _ domain.FileStore = (*Store)(nil)

// New valida la configuración y crea el cliente de GCS.
func New(ctx context.Context, cfg Config) (*Store, error) {
	if !bucketPattern.MatchString(cfg.Bucket) {
		return nil, fmt.Errorf("invalid gcs bucket name %q", cfg.Bucket)
	}

	client, err := storage.NewClient(ctx, cfg.ClientOptions...)
	if err != nil {
		return nil, fmt.Errorf("create gcs client: %w", err)
	}

	publicURL := cfg.PublicURL
	if publicURL == "" {
		publicURL = DefaultPublicURL
	}

	return &Store{
		client:    client,
		bucket:    client.Bucket(cfg.Bucket),
		name:      cfg.Bucket,
		publicURL: strings.TrimRight(publicURL, "/"),
	}, nil
}

// Put sube el archivo en una sola petición y devuelve su URL pública. El tipo
// de contenido y el Content-Disposition se guardan como metadatos del objeto,
// y GCS los devuelve al servirlo. La condición DoesNotExist solo crea objetos
// nuevos: si la clave ya existe (412), es el mismo archivo, porque la clave
// lleva su hash, y no es un error. El cliente no reintenta una escritura
// condicionada que falla a medias.
func (s *Store) Put(ctx context.Context, file domain.StoredFile) (string, error) {
	if !valid(file) {
		return "", fmt.Errorf("gcs put: invalid key %q or content type %q", file.Key, file.ContentType)
	}

	writer := s.bucket.Object(file.Key).If(storage.Conditions{DoesNotExist: true}).NewWriter(ctx)
	writer.ContentType = file.ContentType
	writer.ContentDisposition = file.ContentDisposition
	writer.CacheControl = cacheControl
	// Sin trozos: un archivo de hasta 2 MB cabe en una sola petición, sin
	// sesión de subida reanudable.
	writer.ChunkSize = 0

	if _, err := writer.Write(file.Data); err != nil {
		_ = writer.Close()

		return "", fmt.Errorf("gcs put: write: %w", err)
	}

	if err := writer.Close(); err != nil && !isPreconditionFailed(err) {
		return "", fmt.Errorf("gcs put: %w", err)
	}

	return s.publicURL + "/" + s.name + "/" + file.Key, nil
}

func isPreconditionFailed(err error) bool {
	var apiErr *googleapi.Error

	return errors.As(err, &apiErr) && apiErr.Code == http.StatusPreconditionFailed
}

// Close cierra el cliente.
func (s *Store) Close() error {
	if err := s.client.Close(); err != nil {
		return fmt.Errorf("close gcs client: %w", err)
	}

	return nil
}
