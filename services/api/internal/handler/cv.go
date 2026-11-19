package handler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

const (
	detailInvalidCVFile                = "file must be a PDF"
	detailCVTooLarge                   = "file is too large"
	detailFileStorageDisabled          = "file storage is not configured"
	detailFileStorageUnavailable       = "file storage is unavailable"
	cvUploadMethod                     = http.MethodPost
	cvUploadBodyLimit            int64 = domain.MaxCVBytes
)

// cvUploadPath es la ruta de subida del CV. El límite de cuerpo y el de
// peticiones propios se deciden con ella, antes de que exista la ruta de Gin.
var cvUploadPath = regexp.MustCompile(`^/api/v1/admin/cv/[^/]+$`)

func isCVUpload(method, path string) bool {
	return method == cvUploadMethod && cvUploadPath.MatchString(path)
}

// CVs es lo que los handlers necesitan del service del CV (ADR-028).
type CVs interface {
	Upload(ctx context.Context, language domain.CVLanguage, data []byte) (*domain.CVVersion, error)
	List(ctx context.Context) ([]domain.CVVersion, error)
	Current(ctx context.Context) ([]domain.CVVersion, error)
	SetCurrent(ctx context.Context, id string) (*domain.CVVersion, error)
}

// GetCurrentCV devuelve la URL del PDF vigente de cada idioma. Es pública.
func (s server) GetCurrentCV(ctx context.Context, _ gen.GetCurrentCVRequestObject) (gen.GetCurrentCVResponseObject, error) {
	versions, err := s.cvs.Current(ctx)
	if err != nil {
		return nil, err
	}

	response := gen.GetCurrentCV200JSONResponse{}
	for _, version := range versions {
		file := &gen.CVFile{Url: version.URL, Size: version.Size, UploadedAt: version.UploadedAt}

		switch version.Language {
		case domain.CVLanguageES:
			response.Es = file
		case domain.CVLanguageEN:
			response.En = file
		}
	}

	return response, nil
}

// ListCVVersions lista las versiones de los dos idiomas.
func (s server) ListCVVersions(ctx context.Context, _ gen.ListCVVersionsRequestObject) (gen.ListCVVersionsResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	versions, err := s.cvs.List(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]gen.CVVersion, 0, len(versions))
	for _, version := range versions {
		items = append(items, toCVVersion(version))
	}

	return gen.ListCVVersions200JSONResponse{Items: items}, nil
}

// UploadCV guarda un PDF nuevo y lo deja como el vigente de su idioma. El
// cuerpo ya pasó por limitBody, con el tope del CV.
func (s server) UploadCV(ctx context.Context, request gen.UploadCVRequestObject) (gen.UploadCVResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	// LimitReader es una segunda barrera: si limitBody dejara de ir antes, un
	// cuerpo enorme no llegaría entero a memoria.
	data, err := io.ReadAll(io.LimitReader(request.Body, domain.MaxCVBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read cv upload: %w", err)
	}

	version, err := s.cvs.Upload(ctx, domain.CVLanguage(request.Language), data)
	if err != nil {
		return nil, err
	}

	return gen.UploadCV201JSONResponse(toCVVersion(*version)), nil
}

// SetCurrentCV marca una versión como la vigente de su idioma.
func (s server) SetCurrentCV(ctx context.Context, request gen.SetCurrentCVRequestObject) (gen.SetCurrentCVResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	version, err := s.cvs.SetCurrent(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.SetCurrentCV200JSONResponse(toCVVersion(*version)), nil
}

func toCVVersion(version domain.CVVersion) gen.CVVersion {
	return gen.CVVersion{
		Id:         version.ID,
		Language:   gen.CVLanguage(version.Language),
		Url:        version.URL,
		Size:       version.Size,
		UploadedAt: version.UploadedAt,
		Current:    version.Current,
	}
}
