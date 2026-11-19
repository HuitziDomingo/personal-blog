package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var cvTestTime = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

const testPDFBody = "%PDF-1.7\n%%EOF\n"

// fakeCVs simula el service del CV y registra lo que recibe.
type fakeCVs struct {
	mu         sync.Mutex
	err        error
	uploaded   []byte
	language   domain.CVLanguage
	currentIDs []string
}

func newFakeCVs() *fakeCVs {
	return &fakeCVs{}
}

func cvVersion(id string, language domain.CVLanguage, current bool) domain.CVVersion {
	return domain.CVVersion{
		ID:         id,
		Language:   language,
		Key:        "cv/" + string(language) + "/0123456789abcdef01234567.pdf",
		URL:        "https://storage.googleapis.com/bucket/cv/" + string(language) + "/0123456789abcdef01234567.pdf",
		Size:       15,
		UploadedAt: cvTestTime,
		Current:    current,
	}
}

func (f *fakeCVs) Upload(_ context.Context, language domain.CVLanguage, data []byte) (*domain.CVVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.language, f.uploaded = language, data
	if f.err != nil {
		return nil, f.err
	}

	version := cvVersion("6730f1a2b3c4d5e6f7a8b9e1", language, true)

	return &version, nil
}

func (f *fakeCVs) List(context.Context) ([]domain.CVVersion, error) {
	return []domain.CVVersion{
		cvVersion("6730f1a2b3c4d5e6f7a8b9e2", domain.CVLanguageEN, true),
		cvVersion("6730f1a2b3c4d5e6f7a8b9e1", domain.CVLanguageES, false),
	}, f.err
}

func (f *fakeCVs) Current(context.Context) ([]domain.CVVersion, error) {
	return []domain.CVVersion{cvVersion("6730f1a2b3c4d5e6f7a8b9e2", domain.CVLanguageEN, true)}, f.err
}

func (f *fakeCVs) SetCurrent(_ context.Context, id string) (*domain.CVVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.currentIDs = append(f.currentIDs, id)
	if f.err != nil {
		return nil, f.err
	}

	version := cvVersion(id, domain.CVLanguageES, true)

	return &version, nil
}

func cvRouter(t *testing.T, cvs *fakeCVs) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.CVs = cvs

	return newTestRouterWith(t, cfg)
}

func pdfUpload(headers map[string]string) map[string]string {
	merged := map[string]string{"Content-Type": "application/pdf", "Origin": testOrigin}
	for name, value := range headers {
		merged[name] = value
	}

	return merged
}

func TestGetCurrentCVIsPublic(t *testing.T) {
	router := cvRouter(t, newFakeCVs())

	response := send(router, http.MethodGet, "/api/v1/cv", "", nil)

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{
		"en": {
			"url": "https://storage.googleapis.com/bucket/cv/en/0123456789abcdef01234567.pdf",
			"size": 15,
			"uploadedAt": "2026-11-19T12:00:00Z"
		}
	}`, response.Body.String(), "a language without a current PDF is left out")
}

func TestListCVVersions(t *testing.T) {
	router := cvRouter(t, newFakeCVs())

	response := send(router, http.MethodGet, "/api/v1/admin/cv", "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"items": [
		{"id": "6730f1a2b3c4d5e6f7a8b9e2", "language": "en", "url": "https://storage.googleapis.com/bucket/cv/en/0123456789abcdef01234567.pdf", "size": 15, "uploadedAt": "2026-11-19T12:00:00Z", "current": true},
		{"id": "6730f1a2b3c4d5e6f7a8b9e1", "language": "es", "url": "https://storage.googleapis.com/bucket/cv/es/0123456789abcdef01234567.pdf", "size": 15, "uploadedAt": "2026-11-19T12:00:00Z", "current": false}
	]}`, response.Body.String())
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
}

func TestUploadCV(t *testing.T) {
	cvs := newFakeCVs()
	router := cvRouter(t, cvs)

	response := send(router, http.MethodPost, "/api/v1/admin/cv/es", testPDFBody, pdfUpload(adminSession()))

	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
	assert.JSONEq(t, `{"id": "6730f1a2b3c4d5e6f7a8b9e1", "language": "es", "url": "https://storage.googleapis.com/bucket/cv/es/0123456789abcdef01234567.pdf", "size": 15, "uploadedAt": "2026-11-19T12:00:00Z", "current": true}`, response.Body.String())
	assert.Equal(t, domain.CVLanguageES, cvs.language)
	assert.Equal(t, []byte(testPDFBody), cvs.uploaded)
}

func TestUploadCVAcceptsUpToTwoMegabytesAboveMaxBodyBytes(t *testing.T) {
	cvs := newFakeCVs()
	router := cvRouter(t, cvs)
	// testMaxBodyBytes es 1 KiB: la subida del CV tiene su propio tope.
	body := "%PDF-" + strings.Repeat("a", domain.MaxCVBytes-5)

	response := send(router, http.MethodPost, "/api/v1/admin/cv/en", body, pdfUpload(adminSession()))

	require.Equal(t, http.StatusCreated, response.Code)
	assert.Len(t, cvs.uploaded, domain.MaxCVBytes)
}

func TestUploadCVRejectsMoreThanTwoMegabytes(t *testing.T) {
	cvs := newFakeCVs()
	router := cvRouter(t, cvs)
	body := "%PDF-" + strings.Repeat("a", domain.MaxCVBytes-4)

	response := send(router, http.MethodPost, "/api/v1/admin/cv/en", body, pdfUpload(adminSession()))

	requireProblem(t, response, http.StatusRequestEntityTooLarge)
	assert.Nil(t, cvs.uploaded, "the service never sees it")
}

func TestUploadCVTwoMegabytesOnlyForThatRoute(t *testing.T) {
	router := cvRouter(t, newFakeCVs())
	body := `{"title":"` + strings.Repeat("a", 2*testMaxBodyBytes) + `"}`

	response := send(router, http.MethodPost, "/api/v1/admin/posts", body, map[string]string{"Origin": testOrigin, "Cookie": adminSession()["Cookie"]})

	requireProblem(t, response, http.StatusRequestEntityTooLarge)
}

func TestUploadCVAccessControl(t *testing.T) {
	tests := map[string]struct {
		headers map[string]string
		status  int
	}{
		"no session":     {headers: pdfUpload(nil), status: http.StatusUnauthorized},
		"not an admin":   {headers: pdfUpload(withCookies(accessCookie(editorAccessToken))), status: http.StatusForbidden},
		"foreign origin": {headers: pdfUpload(map[string]string{"Origin": badOrigin, "Cookie": adminSession()["Cookie"]}), status: http.StatusForbidden},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			cvs := newFakeCVs()
			router := cvRouter(t, cvs)

			response := send(router, http.MethodPost, "/api/v1/admin/cv/es", testPDFBody, test.headers)

			requireProblem(t, response, test.status)
			assert.Nil(t, cvs.uploaded)
		})
	}
}

func TestUploadCVContractViolations(t *testing.T) {
	tests := map[string]struct {
		path    string
		headers map[string]string
	}{
		"unknown language":   {path: "/api/v1/admin/cv/fr", headers: pdfUpload(adminSession())},
		"other content type": {path: "/api/v1/admin/cv/es", headers: pdfUpload(map[string]string{"Content-Type": "text/html", "Cookie": adminSession()["Cookie"]})},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			cvs := newFakeCVs()
			router := cvRouter(t, cvs)

			response := send(router, http.MethodPost, test.path, testPDFBody, test.headers)

			requireProblem(t, response, http.StatusBadRequest)
			assert.Nil(t, cvs.uploaded)
		})
	}
}

func TestUploadCVErrors(t *testing.T) {
	tests := map[string]struct {
		err    error
		status int
		detail string
	}{
		"not a pdf":           {err: domain.ErrInvalidCVFile, status: http.StatusBadRequest, detail: "file must be a PDF"},
		"too large":           {err: domain.ErrCVTooLarge, status: http.StatusRequestEntityTooLarge, detail: "file is too large"},
		"no storage":          {err: domain.ErrFileStorageDisabled, status: http.StatusServiceUnavailable, detail: "file storage is not configured"},
		"storage failed":      {err: errors.Join(domain.ErrFileStorageUnavailable, errors.New("bucket secret details")), status: http.StatusServiceUnavailable, detail: "file storage is unavailable"},
		"unexpected database": {err: errors.New("mongo down"), status: http.StatusInternalServerError},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			cvs := newFakeCVs()
			cvs.err = test.err
			router := cvRouter(t, cvs)

			response := send(router, http.MethodPost, "/api/v1/admin/cv/es", testPDFBody, pdfUpload(adminSession()))

			problem := requireProblem(t, response, test.status)
			if test.detail != "" {
				require.NotNil(t, problem.Detail)
				assert.Equal(t, test.detail, *problem.Detail)
			}

			assert.NotContains(t, response.Body.String(), "bucket secret details")
		})
	}
}

func TestSetCurrentCV(t *testing.T) {
	cvs := newFakeCVs()
	router := cvRouter(t, cvs)
	headers := map[string]string{"Origin": testOrigin, "Cookie": adminSession()["Cookie"]}

	response := send(router, http.MethodPost, "/api/v1/admin/cv/versions/6730f1a2b3c4d5e6f7a8b9e1/current", "", headers)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Body.String(), `"current":true`)
	assert.Equal(t, []string{"6730f1a2b3c4d5e6f7a8b9e1"}, cvs.currentIDs)

	cvs.err = domain.ErrNotFound
	requireProblem(t, send(router, http.MethodPost, "/api/v1/admin/cv/versions/6730f1a2b3c4d5e6f7a8b9e9/current", "", headers), http.StatusNotFound)

	requireProblem(t, send(router, http.MethodPost, "/api/v1/admin/cv/versions/6730f1a2b3c4d5e6f7a8b9e1/current", "", map[string]string{"Origin": testOrigin}), http.StatusUnauthorized)
}

func TestUploadCVHasItsOwnRateLimit(t *testing.T) {
	for name, headers := range map[string]map[string]string{
		"per user":           pdfUpload(adminSession()),
		"per ip, no session": pdfUpload(nil),
	} {
		t.Run(name, func(t *testing.T) {
			cfg := testRouterConfig()
			cfg.CVs = newFakeCVs()
			cfg.RateLimits.CVUploads = WindowLimit{Max: 2, Window: time.Hour}
			router := newTestRouterWith(t, cfg)

			codes := make([]int, 0, 3)
			for range 3 {
				codes = append(codes, send(router, http.MethodPost, "/api/v1/admin/cv/es", testPDFBody, headers).Code)
			}

			assert.Equal(t, http.StatusTooManyRequests, codes[2])
			assert.NotEqual(t, http.StatusTooManyRequests, codes[1])

			// El resto del admin no gasta ese bucket.
			list := send(router, http.MethodGet, "/api/v1/admin/cv", "", adminSession())
			assert.NotEqual(t, http.StatusTooManyRequests, list.Code)
		})
	}
}

func TestRouterNeedsCVs(t *testing.T) {
	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	cfg := testRouterConfig()
	cfg.CVs = nil

	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.Error(t, err)
}

func TestMediaIsServedOnlyWhenConfigured(t *testing.T) {
	router := cvRouter(t, newFakeCVs())
	assert.Equal(t, http.StatusNotFound, send(router, http.MethodGet, "/media/cv/es/0123456789abcdef01234567.pdf", "", nil).Code)

	cfg := testRouterConfig()
	var served string
	cfg.Media = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = r.URL.Path
		w.WriteHeader(http.StatusOK)
	})
	router = newTestRouterWith(t, cfg)

	response := send(router, http.MethodGet, "/media/cv/es/0123456789abcdef01234567.pdf", "", nil)
	assert.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, "cv/es/0123456789abcdef01234567.pdf", served, "the prefix is stripped")
}
