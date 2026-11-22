package gcs

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
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
	"google.golang.org/api/option"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	testBucket = "huitzi-files-test"
	testKey    = "covers/6730f1a2b3c4d5e6f7a8b9c0/0123456789abcdef01234567.jpg"
)

var testImage = domain.StoredFile{Key: testKey, ContentType: "image/jpeg", Data: []byte{0xff, 0xd8, 0xff, 'x'}}

const testCVKey = "cv/es/0123456789abcdef01234567.pdf"

var testCV = domain.StoredFile{Key: testCVKey, ContentType: "application/pdf", ContentDisposition: `attachment; filename="cv-es.pdf"`, Data: []byte("%PDF-1.7\n")}

// upload es lo que el servidor de prueba recibió en una subida.
type upload struct {
	mu        sync.Mutex
	requests  int
	method    string
	path      string
	query     map[string][]string
	metadata  map[string]any
	partTypes []string
	data      []byte
}

// newGCSServer simula la API JSON de GCS con httptest: ninguna llamada sale a
// la red ni usa credenciales.
func newGCSServer(t *testing.T, status int) (*httptest.Server, *upload) {
	t.Helper()

	received := &upload{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.mu.Lock()
		defer received.mu.Unlock()

		received.requests++
		received.method, received.path, received.query = r.Method, r.URL.Path, r.URL.Query()

		mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
			w.WriteHeader(http.StatusBadRequest)

			return
		}

		reader := multipart.NewReader(r.Body, params["boundary"])
		for {
			part, err := reader.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}

			if err != nil {
				w.WriteHeader(http.StatusBadRequest)

				return
			}

			received.partTypes = append(received.partTypes, part.Header.Get("Content-Type"))
			raw, _ := io.ReadAll(part)

			if len(received.partTypes) == 1 {
				_ = json.Unmarshal(raw, &received.metadata)
			} else {
				received.data = raw
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)

		if status == http.StatusOK {
			// El cliente compara el CRC32C que devuelve GCS con el de los
			// bytes que envió.
			sum := make([]byte, 4)
			binary.BigEndian.PutUint32(sum, crc32.Checksum(received.data, crc32.MakeTable(crc32.Castagnoli)))
			name, _ := received.metadata["name"].(string)
			_, _ = fmt.Fprintf(w, `{"bucket":%q,"name":%q,"crc32c":%q}`, testBucket, name, base64.StdEncoding.EncodeToString(sum))

			return
		}

		_, _ = fmt.Fprintf(w, `{"error":{"code":%d,"message":"failed"}}`, status)
	}))
	t.Cleanup(server.Close)

	return server, received
}

func newStore(t *testing.T, server *httptest.Server) *Store {
	t.Helper()

	store, err := New(t.Context(), Config{
		Bucket:    testBucket,
		PublicURL: "https://storage.example",
		ClientOptions: []option.ClientOption{
			option.WithEndpoint(server.URL + "/storage/v1/"),
			option.WithoutAuthentication(),
			option.WithHTTPClient(server.Client()),
		},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = store.Close() })

	return store
}

func TestPut(t *testing.T) {
	server, received := newGCSServer(t, http.StatusOK)

	url, err := newStore(t, server).Put(t.Context(), testImage)

	require.NoError(t, err)
	assert.Equal(t, "https://storage.example/"+testBucket+"/"+testKey, url)

	received.mu.Lock()
	defer received.mu.Unlock()

	assert.Equal(t, 1, received.requests, "one request, no resumable session")
	assert.Equal(t, http.MethodPost, received.method)
	assert.Equal(t, "/upload/storage/v1/b/"+testBucket+"/o", received.path)
	assert.Equal(t, []string{"multipart"}, received.query["uploadType"])
	assert.Equal(t, []string{"0"}, received.query["ifGenerationMatch"], "only creates, never overwrites")
	assert.Equal(t, testKey, received.metadata["name"])
	assert.Equal(t, "image/jpeg", received.metadata["contentType"])
	assert.Equal(t, cacheControl, received.metadata["cacheControl"])
	assert.Equal(t, testImage.Data, received.data)
}

func TestPutCVKeepsItsDisposition(t *testing.T) {
	server, received := newGCSServer(t, http.StatusOK)

	url, err := newStore(t, server).Put(t.Context(), testCV)

	require.NoError(t, err)
	assert.Equal(t, "https://storage.example/"+testBucket+"/"+testCVKey, url)

	received.mu.Lock()
	defer received.mu.Unlock()

	assert.Equal(t, "application/pdf", received.metadata["contentType"])
	assert.Equal(t, `attachment; filename="cv-es.pdf"`, received.metadata["contentDisposition"])
	assert.Equal(t, testCV.Data, received.data)
}

func TestPutAcceptsTheProviderFormats(t *testing.T) {
	for ext, contentType := range map[string]string{"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"} {
		t.Run(ext, func(t *testing.T) {
			server, _ := newGCSServer(t, http.StatusOK)
			file := testImage
			file.Key = "covers/6730f1a2b3c4d5e6f7a8b9c0/0123456789abcdef01234567." + ext
			file.ContentType = contentType

			_, err := newStore(t, server).Put(t.Context(), file)

			require.NoError(t, err)
		})
	}
}

func TestPutTheSameImageTwice(t *testing.T) {
	server, _ := newGCSServer(t, http.StatusPreconditionFailed)

	url, err := newStore(t, server).Put(t.Context(), testImage)

	require.NoError(t, err, "412: the object exists and, with the hash in its key, is the same image")
	assert.Equal(t, "https://storage.example/"+testBucket+"/"+testKey, url)
}

func TestPutWhenGCSRefuses(t *testing.T) {
	server, _ := newGCSServer(t, http.StatusForbidden)

	_, err := newStore(t, server).Put(t.Context(), testImage)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "403")
}

func TestPutRejectsOtherKeys(t *testing.T) {
	for name, key := range map[string]string{
		"recorrido":      "covers/../../etc/passwd",
		"otra carpeta":   "backups/6730f1a2b3c4d5e6f7a8b9c0/0123456789abcdef01234567.jpg",
		"otra extensión": "covers/6730f1a2b3c4d5e6f7a8b9c0/0123456789abcdef01234567.html",
		"con consulta":   testKey + "?x=1",
		"cv sin idioma":  "cv/fr/0123456789abcdef01234567.pdf",
	} {
		t.Run(name, func(t *testing.T) {
			server, received := newGCSServer(t, http.StatusOK)
			image := testImage
			image.Key = key

			_, err := newStore(t, server).Put(t.Context(), image)

			require.Error(t, err)

			received.mu.Lock()
			defer received.mu.Unlock()
			assert.Zero(t, received.requests)
		})
	}
}

func TestPutRejectsAMismatchedContentType(t *testing.T) {
	for name, file := range map[string]domain.StoredFile{
		"pdf como html":  {Key: testCVKey, ContentType: "text/html", Data: testCV.Data},
		"jpg como png":   {Key: testKey, ContentType: "image/png", Data: testImage.Data},
		"portada en pdf": {Key: testKey, ContentType: "application/pdf", Data: testImage.Data},
	} {
		t.Run(name, func(t *testing.T) {
			server, received := newGCSServer(t, http.StatusOK)

			_, err := newStore(t, server).Put(t.Context(), file)

			require.Error(t, err)

			received.mu.Lock()
			defer received.mu.Unlock()
			assert.Zero(t, received.requests)
		})
	}
}

func TestNewValidatesTheBucket(t *testing.T) {
	for _, bucket := range []string{"", "ab", "Upper", "with.dots.com", "-starts-with-dash", "has/slash", strings.Repeat("a", 64)} {
		_, err := New(t.Context(), Config{Bucket: bucket, ClientOptions: []option.ClientOption{option.WithoutAuthentication()}})
		require.Error(t, err, bucket)
	}
}
