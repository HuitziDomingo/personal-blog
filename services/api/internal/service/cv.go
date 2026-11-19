package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// MaxCVVersions es cuántas versiones lista el admin.
	MaxCVVersions = 200

	cvContentType = "application/pdf"
	// cvKeyHashChars son los caracteres del hash en la clave: 96 bits bastan
	// para no chocar entre versiones de un CV.
	cvKeyHashChars = 24
)

// CVService sube y versiona el CV en PDF (ADR-028).
type CVService struct {
	versions domain.CVRepository
	// files es nil si la API arrancó sin almacenamiento: subir responde 503,
	// y leer y marcar la vigente funcionan con lo ya guardado.
	files domain.FileStore
	now   func() time.Time
}

// NewCVService crea el service del CV. files puede ser nil.
func NewCVService(versions domain.CVRepository, files domain.FileStore, now func() time.Time) *CVService {
	return &CVService{versions: versions, files: files, now: now}
}

// Upload comprueba el PDF, lo guarda con un nombre generado por la API y deja
// la versión nueva como la vigente de su idioma.
func (s *CVService) Upload(ctx context.Context, language domain.CVLanguage, data []byte) (*domain.CVVersion, error) {
	if !language.IsValid() {
		return nil, fmt.Errorf("upload cv: %w", domain.ErrInvalidInput)
	}

	if err := domain.CheckCVFile(data); err != nil {
		return nil, fmt.Errorf("upload cv: %w", err)
	}

	if s.files == nil {
		return nil, fmt.Errorf("upload cv: %w", domain.ErrFileStorageDisabled)
	}

	key := cvKey(language, data)

	url, err := s.files.Put(ctx, domain.StoredFile{
		Key:                key,
		ContentType:        cvContentType,
		ContentDisposition: fmt.Sprintf("attachment; filename=%q", "cv-"+string(language)+".pdf"),
		Data:               data,
	})
	if err != nil {
		return nil, fmt.Errorf("upload cv: %w: %w", domain.ErrFileStorageUnavailable, err)
	}

	version := &domain.CVVersion{
		Language:   language,
		Key:        key,
		URL:        url,
		Size:       int64(len(data)),
		UploadedAt: s.now().UTC(),
	}

	if err := s.versions.Create(ctx, version); err != nil {
		return nil, fmt.Errorf("upload cv: %w", err)
	}

	current, err := s.versions.SetCurrent(ctx, version.ID)
	if err != nil {
		return nil, fmt.Errorf("upload cv: %w", err)
	}

	return current, nil
}

// List devuelve las versiones de los dos idiomas, de la más reciente a la más
// antigua.
func (s *CVService) List(ctx context.Context) ([]domain.CVVersion, error) {
	versions, err := s.versions.List(ctx, MaxCVVersions)
	if err != nil {
		return nil, fmt.Errorf("list cv versions: %w", err)
	}

	return versions, nil
}

// Current devuelve la versión vigente de cada idioma que tenga una.
func (s *CVService) Current(ctx context.Context) ([]domain.CVVersion, error) {
	versions, err := s.versions.Current(ctx)
	if err != nil {
		return nil, fmt.Errorf("current cv: %w", err)
	}

	return versions, nil
}

// SetCurrent marca una versión como la vigente de su idioma.
func (s *CVService) SetCurrent(ctx context.Context, id string) (*domain.CVVersion, error) {
	version, err := s.versions.SetCurrent(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("set current cv: %w", err)
	}

	return version, nil
}

// cvKey es cv/<idioma>/<hash>.pdf. El nombre del archivo subido nunca llega
// aquí: la clave solo depende del idioma y de los bytes.
func cvKey(language domain.CVLanguage, data []byte) string {
	sum := sha256.Sum256(data)

	return "cv/" + string(language) + "/" + hex.EncodeToString(sum[:])[:cvKeyHashChars] + ".pdf"
}
