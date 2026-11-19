package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var cvTestTime = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

// fakeCVRepository guarda las versiones en memoria, en orden de creación.
type fakeCVRepository struct {
	mu       sync.Mutex
	versions []domain.CVVersion
	err      error
}

func (f *fakeCVRepository) Create(_ context.Context, version *domain.CVVersion) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return f.err
	}

	version.ID = fmt.Sprintf("%024d", len(f.versions)+1)
	f.versions = append(f.versions, *version)

	return nil
}

func (f *fakeCVRepository) List(_ context.Context, limit int) ([]domain.CVVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	versions := slices.Clone(f.versions)
	slices.Reverse(versions)

	return versions[:min(limit, len(versions))], f.err
}

func (f *fakeCVRepository) Current(_ context.Context) ([]domain.CVVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var current []domain.CVVersion
	for _, version := range f.versions {
		if version.Current {
			current = append(current, version)
		}
	}

	return current, f.err
}

func (f *fakeCVRepository) SetCurrent(_ context.Context, id string) (*domain.CVVersion, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	index := slices.IndexFunc(f.versions, func(version domain.CVVersion) bool { return version.ID == id })
	if index < 0 {
		return nil, domain.ErrNotFound
	}

	for i := range f.versions {
		if f.versions[i].Language == f.versions[index].Language {
			f.versions[i].Current = i == index
		}
	}

	version := f.versions[index]

	return &version, nil
}

// fakeFileStore guarda los archivos en un mapa por clave.
type fakeFileStore struct {
	files map[string]domain.StoredFile
	err   error
}

func (f *fakeFileStore) Put(_ context.Context, file domain.StoredFile) (string, error) {
	if f.err != nil {
		return "", f.err
	}

	if f.files == nil {
		f.files = map[string]domain.StoredFile{}
	}

	f.files[file.Key] = file

	return "https://files.example/" + file.Key, nil
}

func pdf(body string) []byte {
	return []byte("%PDF-1.7\n" + body + "\n%%EOF\n")
}

func newTestCVService(files domain.FileStore) (*CVService, *fakeCVRepository) {
	repository := &fakeCVRepository{}

	return NewCVService(repository, files, func() time.Time { return cvTestTime }), repository
}

func TestCVUploadStoresTheFileAndMakesItCurrent(t *testing.T) {
	files := &fakeFileStore{}
	cvs, _ := newTestCVService(files)
	data := pdf("primera")

	version, err := cvs.Upload(t.Context(), domain.CVLanguageES, data)
	require.NoError(t, err)

	assert.Regexp(t, regexp.MustCompile(`^cv/es/[0-9a-f]{24}\.pdf$`), version.Key)
	assert.Equal(t, "https://files.example/"+version.Key, version.URL)
	assert.Equal(t, int64(len(data)), version.Size)
	assert.Equal(t, cvTestTime, version.UploadedAt)
	assert.True(t, version.Current)

	stored := files.files[version.Key]
	assert.Equal(t, "application/pdf", stored.ContentType)
	assert.Equal(t, `attachment; filename="cv-es.pdf"`, stored.ContentDisposition)
	assert.Equal(t, data, stored.Data)
}

func TestCVUploadReplacesOnlyTheCurrentOfItsLanguage(t *testing.T) {
	cvs, _ := newTestCVService(&fakeFileStore{})

	english, err := cvs.Upload(t.Context(), domain.CVLanguageEN, pdf("en"))
	require.NoError(t, err)
	_, err = cvs.Upload(t.Context(), domain.CVLanguageES, pdf("es 1"))
	require.NoError(t, err)
	latest, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("es 2"))
	require.NoError(t, err)

	current, err := cvs.Current(t.Context())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{english.ID, latest.ID}, []string{current[0].ID, current[1].ID})

	versions, err := cvs.List(t.Context())
	require.NoError(t, err)
	require.Len(t, versions, 3)
	assert.Equal(t, latest.ID, versions[0].ID, "newest first")
}

func TestCVUploadNamesTheFileFromTheBytesOnly(t *testing.T) {
	cvs, _ := newTestCVService(&fakeFileStore{})

	first, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("igual"))
	require.NoError(t, err)
	second, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("igual"))
	require.NoError(t, err)
	other, err := cvs.Upload(t.Context(), domain.CVLanguageEN, pdf("igual"))
	require.NoError(t, err)

	assert.Equal(t, first.Key, second.Key)
	assert.NotEqual(t, first.ID, second.ID, "each upload is its own version")
	assert.NotEqual(t, first.Key, other.Key, "the language is part of the key")
}

func TestCVUploadRejectsBadFiles(t *testing.T) {
	tests := map[string]struct {
		data []byte
		want error
	}{
		"empty":                {data: nil, want: domain.ErrInvalidCVFile},
		"not a pdf":            {data: []byte("<html><script>alert(1)</script>"), want: domain.ErrInvalidCVFile},
		"signature not first":  {data: []byte(" %PDF-1.7"), want: domain.ErrInvalidCVFile},
		"lowercase signature":  {data: []byte("%pdf-1.7"), want: domain.ErrInvalidCVFile},
		"one byte over 2 MiB":  {data: append(pdf(""), bytes.Repeat([]byte("a"), domain.MaxCVBytes)...), want: domain.ErrCVTooLarge},
		"exactly 2 MiB passes": {data: append([]byte("%PDF-"), bytes.Repeat([]byte("a"), domain.MaxCVBytes-5)...)},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			files := &fakeFileStore{}
			cvs, repository := newTestCVService(files)

			_, err := cvs.Upload(t.Context(), domain.CVLanguageES, test.data)
			if test.want == nil {
				require.NoError(t, err)

				return
			}

			require.ErrorIs(t, err, test.want)
			assert.Empty(t, files.files, "nothing reaches the store")
			assert.Empty(t, repository.versions)
		})
	}
}

func TestCVUploadRejectsAnUnknownLanguage(t *testing.T) {
	cvs, _ := newTestCVService(&fakeFileStore{})

	_, err := cvs.Upload(t.Context(), domain.CVLanguage("fr"), pdf("x"))

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestCVUploadWithoutStorage(t *testing.T) {
	cvs, repository := newTestCVService(nil)

	_, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("x"))

	require.ErrorIs(t, err, domain.ErrFileStorageDisabled)
	assert.Empty(t, repository.versions)
}

func TestCVUploadWhenTheStoreFails(t *testing.T) {
	cvs, repository := newTestCVService(&fakeFileStore{err: errors.New("bucket down")})

	_, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("x"))

	require.ErrorIs(t, err, domain.ErrFileStorageUnavailable)
	assert.Empty(t, repository.versions, "no metadata without a file")
}

func TestCVSetCurrent(t *testing.T) {
	cvs, _ := newTestCVService(&fakeFileStore{})

	old, err := cvs.Upload(t.Context(), domain.CVLanguageES, pdf("vieja"))
	require.NoError(t, err)
	_, err = cvs.Upload(t.Context(), domain.CVLanguageES, pdf("nueva"))
	require.NoError(t, err)

	version, err := cvs.SetCurrent(t.Context(), old.ID)
	require.NoError(t, err)
	assert.True(t, version.Current)

	current, err := cvs.Current(t.Context())
	require.NoError(t, err)
	require.Len(t, current, 1)
	assert.Equal(t, old.ID, current[0].ID)

	_, err = cvs.SetCurrent(t.Context(), "missing")
	require.ErrorIs(t, err, domain.ErrNotFound)
}
