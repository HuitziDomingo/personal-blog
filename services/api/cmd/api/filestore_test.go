package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/config"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// fakeGCS recibe las subidas multipart de la API JSON de GCS y responde como
// GCS, con el CRC32C de los bytes recibidos.
type fakeGCS struct {
	mu    sync.Mutex
	paths []string
	names []string
}

func (f *fakeGCS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
		w.WriteHeader(http.StatusBadRequest)

		return
	}

	reader := multipart.NewReader(r.Body, params["boundary"])
	var metadata, data []byte
	for part, err := reader.NextPart(); err == nil; part, err = reader.NextPart() {
		raw, _ := io.ReadAll(part)
		if metadata == nil {
			metadata = raw
		} else {
			data = raw
		}
	}

	name := between(string(metadata), `"name":"`, `"`)
	f.mu.Lock()
	f.paths = append(f.paths, r.URL.Path)
	f.names = append(f.names, name)
	f.mu.Unlock()

	sum := make([]byte, 4)
	binary.BigEndian.PutUint32(sum, crc32.Checksum(data, crc32.MakeTable(crc32.Castagnoli)))
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"bucket": "blog-files",
		"name":   name,
		"crc32c": base64.StdEncoding.EncodeToString(sum),
	})
}

func between(s, start, end string) string {
	_, after, ok := strings.Cut(s, start)
	if !ok {
		return ""
	}
	value, _, _ := strings.Cut(after, end)

	return value
}

// FILES_STORE=gcs como en producción, por el mismo camino que main:
// newFileStore y el cliente oficial de GCS.
// STORAGE_EMULATOR_HOST (soportado por el cliente) lo apunta a un GCS falso,
// sin credenciales ni red.
func TestNewFileStoreGCS(t *testing.T) {
	fake := &fakeGCS{}
	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)

	t.Setenv("STORAGE_EMULATOR_HOST", strings.TrimPrefix(server.URL, "http://"))

	// Lo que config.Load arma con FILES_STORE=gcs y FILES_GCS_BUCKET (sus
	// casos están en internal/config/files_test.go).
	files := config.Files{Store: config.FilesStoreGCS, GCSBucket: "blog-files"}

	store, mediaHandler, closeStore, err := newFileStore(t.Context(), files)
	require.NoError(t, err)
	t.Cleanup(closeStore)

	require.NotNil(t, store)
	assert.Nil(t, mediaHandler, "gcs serves the files itself: the API does not mount /media/")

	cv := domain.StoredFile{Key: "cv/es/0123456789abcdef01234567.pdf", ContentType: "application/pdf", ContentDisposition: `attachment; filename="cv-es.pdf"`, Data: []byte("%PDF-1.7\n")}
	url, err := store.Put(t.Context(), cv)
	require.NoError(t, err)

	assert.Equal(t, "https://storage.googleapis.com/blog-files/"+cv.Key, url)
	fake.mu.Lock()
	defer fake.mu.Unlock()
	assert.Equal(t, []string{"/upload/storage/v1/b/blog-files/o"}, fake.paths)
	assert.Equal(t, []string{cv.Key}, fake.names)
}
