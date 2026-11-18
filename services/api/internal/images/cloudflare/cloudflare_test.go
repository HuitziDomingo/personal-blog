package cloudflare

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	testAccountID = "0123456789abcdef0123456789abcdef"
	testAuth      = "cf-test-token-never-real"
	testPrompt    = "Editorial cover illustration about: robots."
)

var testImage = []byte{0xff, 0xd8, 0xff, 0xe0, 'f', 'a', 'k', 'e'}

// recordedRequest es lo que el servidor de prueba recibió.
type recordedRequest struct {
	method, path, auth, contentType string
	body                            runRequest
}

// newServer simula Workers AI con httptest: ninguna llamada sale a la red.
func newServer(t *testing.T, status int, body string) (*httptest.Server, *recordedRequest) {
	t.Helper()

	recorded := &recordedRequest{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorded.method, recorded.path = r.Method, r.URL.Path
		recorded.auth, recorded.contentType = r.Header.Get("Authorization"), r.Header.Get("Content-Type")

		raw, err := io.ReadAll(r.Body)
		if err == nil {
			_ = json.Unmarshal(raw, &recorded.body)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(server.Close)

	return server, recorded
}

func newGenerator(t *testing.T, server *httptest.Server) *Generator {
	t.Helper()

	generator, err := New(Config{AccountID: testAccountID, Token: testAuth, BaseURL: server.URL, HTTPClient: server.Client()})
	require.NoError(t, err)

	return generator
}

func TestGenerate(t *testing.T) {
	body := `{"result":{"image":"` + base64.StdEncoding.EncodeToString(testImage) + `"},"success":true,"errors":[],"messages":[]}`
	server, recorded := newServer(t, http.StatusOK, body)

	generated, err := newGenerator(t, server).Generate(t.Context(), testPrompt)

	require.NoError(t, err)
	assert.Equal(t, domain.GeneratedImage{Data: testImage, Model: Model}, generated)
	assert.Equal(t, http.MethodPost, recorded.method)
	assert.Equal(t, "/accounts/"+testAccountID+"/ai/run/@cf/black-forest-labs/flux-1-schnell", recorded.path)
	assert.Equal(t, "Bearer "+testAuth, recorded.auth)
	assert.Equal(t, "application/json", recorded.contentType)
	assert.Equal(t, runRequest{Prompt: testPrompt, Steps: 4}, recorded.body)
}

func TestGenerateErrors(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		wantErr error
		want    string
	}{
		{
			name:    "cuota diaria agotada",
			status:  http.StatusTooManyRequests,
			body:    `{"success":false,"errors":[{"code":3036,"message":"You have used up your daily free allocation of 10,000 neurons."}],"result":null}`,
			wantErr: domain.ErrImagesQuotaExceeded,
			want:    "status 429, code 3036",
		},
		{
			name:    "capacidad agotada",
			status:  http.StatusTooManyRequests,
			body:    `{"success":false,"errors":[{"code":3040,"message":"Capacity temporarily exceeded"}]}`,
			wantErr: domain.ErrImagesUnavailable,
			want:    "status 429, codes [3040]",
		},
		{
			name:    "token inválido",
			status:  http.StatusUnauthorized,
			body:    `{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}`,
			wantErr: domain.ErrImagesUnavailable,
			want:    "status 401, codes [10000]",
		},
		{
			name:    "error sin JSON",
			status:  http.StatusBadGateway,
			body:    `<html>bad gateway</html>`,
			wantErr: domain.ErrImagesUnavailable,
			want:    "status 502, unreadable response",
		},
		{
			name:    "200 sin éxito",
			status:  http.StatusOK,
			body:    `{"success":false,"errors":[{"code":5007}]}`,
			wantErr: domain.ErrImagesUnavailable,
			want:    "codes [5007]",
		},
		{
			name:    "imagen que no es base64",
			status:  http.StatusOK,
			body:    `{"success":true,"result":{"image":"***"}}`,
			wantErr: domain.ErrImagesUnavailable,
			want:    "not valid base64",
		},
		{
			name:    "sin imagen",
			status:  http.StatusOK,
			body:    `{"success":true,"result":{}}`,
			wantErr: domain.ErrImagesUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := newServer(t, tt.status, tt.body)

			_, err := newGenerator(t, server).Generate(t.Context(), testPrompt)

			require.ErrorIs(t, err, tt.wantErr)
			assert.Contains(t, err.Error(), tt.want)
			assert.NotContains(t, err.Error(), testAuth)
			assert.NotContains(t, err.Error(), testPrompt)
			assert.NotContains(t, err.Error(), "neurons", "provider messages are not copied")
		})
	}
}

func TestGenerateHonorsTheContextTimeout(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { <-release }))
	t.Cleanup(server.Close)
	t.Cleanup(func() { close(release) })

	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()

	_, err := newGenerator(t, server).Generate(ctx, testPrompt)

	require.ErrorIs(t, err, domain.ErrImagesUnavailable)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.NotContains(t, err.Error(), testAccountID)
}

func TestGenerateWithoutAServer(t *testing.T) {
	generator, err := New(Config{AccountID: testAccountID, Token: testAuth, BaseURL: "http://127.0.0.1:1"})
	require.NoError(t, err)

	_, err = generator.Generate(t.Context(), testPrompt)

	require.ErrorIs(t, err, domain.ErrImagesUnavailable)
	assert.Equal(t, "image generation is unavailable: request failed", err.Error())
}

func TestNewValidatesTheConfig(t *testing.T) {
	for name, cfg := range map[string]Config{
		"sin cuenta":          {Token: testAuth},
		"cuenta con ruta":     {AccountID: "../../zones/abc", Token: testAuth},
		"cuenta en mayúscula": {AccountID: strings.ToUpper(testAccountID), Token: testAuth},
		"sin token":           {AccountID: testAccountID},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := New(cfg)
			require.Error(t, err)
			assert.NotContains(t, err.Error(), testAuth)
		})
	}

	generator, err := New(Config{AccountID: testAccountID, Token: testAuth})
	require.NoError(t, err)
	assert.Equal(t, DefaultBaseURL+"/accounts/"+testAccountID+"/ai/run/"+Model, generator.endpoint)
}
