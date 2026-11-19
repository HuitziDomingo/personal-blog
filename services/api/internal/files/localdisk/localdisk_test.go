package localdisk

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const testKey = "cv/es/0123456789abcdef01234567.pdf"

var testPDF = []byte("%PDF-1.7\n%%EOF\n")

func newTestStore(t *testing.T) (*Store, string) {
	t.Helper()

	dir := t.TempDir()
	store, err := New(dir, "http://localhost:8080/media/")
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, store.Close()) })

	return store, dir
}

func TestNewNeedsDirectoryAndBaseURL(t *testing.T) {
	_, err := New("", "http://localhost:8080/media")
	require.Error(t, err)

	_, err = New(t.TempDir(), "")
	require.Error(t, err)
}

func TestPutWritesTheFileAndReturnsItsURL(t *testing.T) {
	store, dir := newTestStore(t)

	url, err := store.Put(t.Context(), domain.StoredFile{Key: testKey, ContentType: "application/pdf", Data: testPDF})
	require.NoError(t, err)
	assert.Equal(t, "http://localhost:8080/media/"+testKey, url)

	written, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(testKey))) //nolint:gosec // Ruta del test, bajo t.TempDir().
	require.NoError(t, err)
	assert.Equal(t, testPDF, written)
}

func TestPutRejectsKeysTheServicesNeverGenerate(t *testing.T) {
	store, dir := newTestStore(t)

	for _, file := range []domain.StoredFile{
		{Key: "../escape.pdf", ContentType: "application/pdf"},
		{Key: "cv/es/../../escape.pdf", ContentType: "application/pdf"},
		{Key: "cv/fr/0123456789abcdef01234567.pdf", ContentType: "application/pdf"},
		{Key: "cv/es/0123456789abcdef01234567.html", ContentType: "application/pdf"},
		{Key: testKey, ContentType: "text/html"},
	} {
		_, err := store.Put(t.Context(), file)
		require.Error(t, err, file.Key)
	}

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Empty(t, entries)
}

func TestHandlerServesThePDFAsADownload(t *testing.T) {
	store, _ := newTestStore(t)
	_, err := store.Put(t.Context(), domain.StoredFile{Key: testKey, ContentType: "application/pdf", Data: testPDF})
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	store.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/"+testKey, nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, testPDF, recorder.Body.Bytes())
	assert.Equal(t, "application/pdf", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, `attachment; filename="cv-es.pdf"`, recorder.Header().Get("Content-Disposition"))
	assert.Contains(t, recorder.Header().Get("Content-Security-Policy"), "sandbox")
}

func TestHandlerOnlyServesExactKeys(t *testing.T) {
	store, _ := newTestStore(t)
	_, err := store.Put(t.Context(), domain.StoredFile{Key: testKey, ContentType: "application/pdf", Data: testPDF})
	require.NoError(t, err)

	for _, target := range []string{"/", "/cv/", "/cv/es/", "/cv/es/ffffffffffffffffffffffff.pdf"} {
		recorder := httptest.NewRecorder()
		store.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
		assert.Equal(t, http.StatusNotFound, recorder.Code, target)
	}
}
