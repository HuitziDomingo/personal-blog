// Package localdisk implementa domain.FileStore en un directorio local, solo
// para desarrollo (ADR-026, punto 3, y ADR-028, punto 5). La API sirve ese
// directorio bajo /media/, en su propio origen: nunca el de la web ni el del
// admin.
package localdisk

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	dirPermissions  = 0o750
	filePermissions = 0o640

	// mediaPolicy no deja ejecutar nada a un archivo abierto en el navegador:
	// sin scripts, sin plugins y en un origen opaco.
	mediaPolicy = "default-src 'none'; sandbox"
)

// fileKind es un tipo de archivo que el almacén acepta: el patrón de sus
// claves y las cabeceras con que se sirve. El disco no guarda metadatos, así
// que las cabeceras salen de la clave.
type fileKind struct {
	pattern     *regexp.Regexp
	contentType string
	disposition func(key string) string
}

// kinds son las claves que generan los services. Con ellas ninguna clave sale
// del directorio; os.Root lo garantiza además.
var kinds = []fileKind{
	{
		// cv/<idioma>/<hash>.pdf (ADR-028).
		pattern:     regexp.MustCompile(`^cv/(es|en)/[0-9a-f]{24}\.pdf$`),
		contentType: "application/pdf",
		disposition: func(key string) string {
			return fmt.Sprintf("attachment; filename=%q", "cv-"+strings.Split(key, "/")[1]+".pdf")
		},
	},
}

func kindOf(key string) (fileKind, bool) {
	for _, kind := range kinds {
		if kind.pattern.MatchString(key) {
			return kind, true
		}
	}

	return fileKind{}, false
}

// Store guarda los archivos en un directorio.
type Store struct {
	root    *os.Root
	baseURL string
}

var _ domain.FileStore = (*Store)(nil)

// New crea el directorio si no existe y lo abre con os.Root, que impide
// escribir fuera de él aunque una clave tuviera "..". baseURL es la URL bajo
// la que se sirve, por ejemplo http://localhost:8080/media.
func New(dir, baseURL string) (*Store, error) {
	if dir == "" || baseURL == "" {
		return nil, errors.New("local file store needs a directory and a base url")
	}

	if err := os.MkdirAll(dir, dirPermissions); err != nil {
		return nil, fmt.Errorf("create file directory: %w", err)
	}

	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open file directory: %w", err)
	}

	return &Store{root: root, baseURL: strings.TrimRight(baseURL, "/")}, nil
}

// Put escribe el archivo y devuelve su URL.
func (s *Store) Put(_ context.Context, file domain.StoredFile) (string, error) {
	kind, ok := kindOf(file.Key)
	if !ok || file.ContentType != kind.contentType {
		return "", fmt.Errorf("local put: invalid key %q or content type %q", file.Key, file.ContentType)
	}

	if err := s.root.MkdirAll(path.Dir(file.Key), dirPermissions); err != nil {
		return "", fmt.Errorf("local put: %w", err)
	}

	if err := s.root.WriteFile(file.Key, file.Data, filePermissions); err != nil {
		return "", fmt.Errorf("local put: %w", err)
	}

	return s.baseURL + "/" + file.Key, nil
}

// Handler sirve el directorio, sin listados: solo las claves exactas, con su
// tipo, como descarga y sin que el navegador adivine el tipo.
func (s *Store) Handler() http.Handler {
	files := http.FileServerFS(s.root.FS())

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimPrefix(r.URL.Path, "/")

		kind, ok := kindOf(key)
		if !ok {
			http.NotFound(w, r)

			return
		}

		header := w.Header()
		header.Set("Content-Type", kind.contentType)
		header.Set("Content-Disposition", kind.disposition(key))
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Content-Security-Policy", mediaPolicy)

		files.ServeHTTP(w, r)
	})
}

// Close cierra el directorio.
func (s *Store) Close() error {
	if err := s.root.Close(); err != nil {
		return fmt.Errorf("close file directory: %w", err)
	}

	return nil
}
