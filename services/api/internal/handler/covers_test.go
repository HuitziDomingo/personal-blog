package handler

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	coverPreviewPath = "/api/v1/admin/posts/" + testPostID + "/cover/preview"
	coverPostPath    = "/api/v1/admin/posts/" + testPostID + "/cover"
	testCoverToken   = "1763400000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)

var testCoverImage = []byte("not really a jpeg")

// fakeCovers es el service de portadas para los tests del handler (ADR-015).
const testBlurDataURL = "data:image/png;base64,iVBORw0KGgo="

type fakeCovers struct {
	mu sync.Mutex

	preview service.CoverPreview
	err     error

	previews    [][2]string
	acceptances []service.CoverAcceptance
	acceptedFor [][2]string
}

func (f *fakeCovers) Preview(_ context.Context, userID, postID string) (service.CoverPreview, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.previews = append(f.previews, [2]string{userID, postID})

	return f.preview, f.err
}

func (f *fakeCovers) Accept(_ context.Context, userID, postID string, acceptance service.CoverAcceptance) (*domain.Post, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.acceptedFor = append(f.acceptedFor, [2]string{userID, postID})
	f.acceptances = append(f.acceptances, acceptance)

	if f.err != nil {
		return nil, f.err
	}

	post := newTestPost()
	post.Cover = &domain.Cover{URL: "https://storage.googleapis.com/bucket/covers/x.jpg", Alt: acceptance.Alt, AIGenerated: true, BlurDataURL: testBlurDataURL}

	return post, nil
}

func coversRouter(t *testing.T, covers *fakeCovers) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.Covers = covers
	cfg.MaxBodyBytes = 1 << 20

	return newTestRouterWith(t, cfg)
}

func acceptBody(image []byte, token, alt string) string {
	return fmt.Sprintf(`{"image":%q,"token":%q,"alt":%q}`, base64.StdEncoding.EncodeToString(image), token, alt)
}

func TestGenerateCoverPreview(t *testing.T) {
	expiresAt := time.Date(2026, 11, 17, 12, 30, 0, 0, time.UTC)
	covers := &fakeCovers{preview: service.CoverPreview{
		Image: testCoverImage, ContentType: "image/jpeg", Width: 1024, Height: 576,
		Subject: "Robots on a desk", Alt: "Robots sobre un escritorio.", Token: testCoverToken, ExpiresAt: expiresAt,
	}}

	response := send(coversRouter(t, covers), http.MethodPost, coverPreviewPath, "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, fmt.Sprintf(`{
		"image": %q,
		"contentType": "image/jpeg",
		"width": 1024,
		"height": 576,
		"subject": "Robots on a desk",
		"alt": "Robots sobre un escritorio.",
		"token": %q,
		"expiresAt": "2026-11-17T12:30:00Z"
	}`, base64.StdEncoding.EncodeToString(testCoverImage), testCoverToken), response.Body.String())
	assert.Equal(t, [][2]string{{testUser.ID, testPostID}}, covers.previews)
}

func TestAcceptCover(t *testing.T) {
	covers := &fakeCovers{}

	response := send(coversRouter(t, covers), http.MethodPut, coverPostPath, acceptBody(testCoverImage, testCoverToken, "Robots sobre un escritorio."), adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Body.String(), `"cover":{"aiGenerated":true,"alt":"Robots sobre un escritorio.","blurDataUrl":"`+testBlurDataURL+`","url":"https://storage.googleapis.com/bucket/covers/x.jpg"}`)
	assert.Equal(t, [][2]string{{testUser.ID, testPostID}}, covers.acceptedFor)
	assert.Equal(t, []service.CoverAcceptance{{Image: testCoverImage, Token: testCoverToken, Alt: "Robots sobre un escritorio."}}, covers.acceptances)
}

func TestAcceptCoverRejectsBodiesAgainstTheContract(t *testing.T) {
	// 2 MiB + 2 bytes son 2 796 208 caracteres de base64, más que el
	// maxLength del contrato (2 796 204) pero menos que el límite de cuerpo
	// de la ruta: lo rechaza el validador con 400.
	tooBig := make([]byte, 2<<20+2)

	for name, body := range map[string]string{
		"token mal formado":      acceptBody(testCoverImage, "not-a-token", "Alt."),
		"alt vacío":              acceptBody(testCoverImage, testCoverToken, ""),
		"alt con salto":          acceptBody(testCoverImage, testCoverToken, "Hola\nmundo"),
		"alt con símbolos":       acceptBody(testCoverImage, testCoverToken, "<img src=x>"),
		"alt largo":              acceptBody(testCoverImage, testCoverToken, strings.Repeat("a", 251)),
		"imagen de más de 2 MiB": acceptBody(tooBig, testCoverToken, "Alt."),
		"imagen no es base64":    fmt.Sprintf(`{"image":"***","token":%q,"alt":"Alt."}`, testCoverToken),
		"sin imagen":             fmt.Sprintf(`{"token":%q,"alt":"Alt."}`, testCoverToken),
	} {
		t.Run(name, func(t *testing.T) {
			covers := &fakeCovers{}

			response := send(coversRouter(t, covers), http.MethodPut, coverPostPath, body, adminSession())

			requireProblem(t, response, http.StatusBadRequest)
			assert.Empty(t, covers.acceptances)
		})
	}
}

// Aceptar una portada tiene su propio límite de cuerpo: una imagen de 1,5 MiB
// pasa aunque MAX_BODY_BYTES sea 1 MiB, y el resto de la API sigue con el
// límite general.
func TestAcceptCoverHasItsOwnBodyLimit(t *testing.T) {
	covers := &fakeCovers{}
	router := coversRouter(t, covers)

	big := make([]byte, 3<<19)
	response := send(router, http.MethodPut, coverPostPath, acceptBody(big, testCoverToken, "Alt."), adminSession())
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Len(t, covers.acceptances, 1)

	tooLarge := strings.Repeat("a", int(coverAcceptBodyLimit)+1)
	response = send(router, http.MethodPut, coverPostPath, tooLarge, adminSession())
	requireProblem(t, response, http.StatusRequestEntityTooLarge)

	response = send(router, http.MethodPut, "/api/v1/admin/posts/"+testPostID, `{"title":"`+strings.Repeat("a", 1<<20)+`"}`, adminSession())
	requireProblem(t, response, http.StatusRequestEntityTooLarge)
}

func TestRemoveCover(t *testing.T) {
	cfg := testRouterConfig()
	posts := newFakePosts()
	cfg.Posts = posts

	response := send(newTestRouterWith(t, cfg), http.MethodDelete, coverPostPath, "", adminSession())

	require.Equal(t, http.StatusNoContent, response.Code)
	assert.Equal(t, []string{testPostID}, posts.uncovered)

	missing := send(newTestRouterWith(t, cfg), http.MethodDelete, "/api/v1/admin/posts/nope/cover", "", adminSession())
	requireProblem(t, missing, http.StatusNotFound)
}

func TestCoversRequireAnAdminSession(t *testing.T) {
	requests := []struct{ method, path, body string }{
		{http.MethodPost, coverPreviewPath, ""},
		{http.MethodPut, coverPostPath, acceptBody(testCoverImage, testCoverToken, "Alt.")},
		{http.MethodDelete, coverPostPath, ""},
	}

	for _, request := range requests {
		for name, tt := range map[string]struct {
			headers map[string]string
			status  int
		}{
			"sin sesión":     {status: http.StatusUnauthorized},
			"no es admin":    {headers: withCookies(accessCookie(editorAccessToken)), status: http.StatusForbidden},
			"Origin ajeno":   {headers: withOrigin(adminSession(), "https://evil.example"), status: http.StatusForbidden},
			"sesión forjada": {headers: withCookies(accessCookie("forged")), status: http.StatusUnauthorized},
		} {
			t.Run(request.method+" "+name, func(t *testing.T) {
				covers := &fakeCovers{}

				response := send(coversRouter(t, covers), request.method, request.path, request.body, tt.headers)

				requireProblem(t, response, tt.status)
				assert.Empty(t, covers.previews, "nada llega al proveedor")
				assert.Empty(t, covers.acceptances)
			})
		}
	}
}

func TestCoverErrorsAreProblems(t *testing.T) {
	tests := []struct {
		err    error
		status int
		detail string
	}{
		{domain.ErrImagesDisabled, http.StatusServiceUnavailable, "image generation is disabled"},
		{fmt.Errorf("wrapped: %w", domain.ErrImagesQuotaExceeded), http.StatusServiceUnavailable, "image generation quota exhausted, try again tomorrow"},
		{fmt.Errorf("wrapped: %w", domain.ErrImagesUnavailable), http.StatusServiceUnavailable, "image generation is unavailable, try again later"},
		{fmt.Errorf("%w: %w", domain.ErrCoverStoreUnavailable, errors.New("gcs put: status 403")), http.StatusServiceUnavailable, "cover storage is unavailable, try again later"},
		{fmt.Errorf("wrapped: %w", domain.ErrInvalidCoverPreview), http.StatusBadRequest, "invalid or expired cover preview"},
		{fmt.Errorf("wrapped: %w", domain.ErrAssistantUnavailable), http.StatusServiceUnavailable, detailAssistantUnavailable},
		{domain.ErrNotFound, http.StatusNotFound, ""},
	}

	for _, tt := range tests {
		t.Run(tt.err.Error(), func(t *testing.T) {
			covers := &fakeCovers{err: tt.err}
			router := coversRouter(t, covers)

			for _, request := range []struct{ method, path, body string }{
				{http.MethodPost, coverPreviewPath, ""},
				{http.MethodPut, coverPostPath, acceptBody(testCoverImage, testCoverToken, "Alt.")},
			} {
				problem := requireProblem(t, send(router, request.method, request.path, request.body, adminSession()), tt.status)
				if tt.detail == "" {
					assert.Nil(t, problem.Detail)

					continue
				}

				require.NotNil(t, problem.Detail)
				assert.Equal(t, tt.detail, *problem.Detail, "the cause never reaches the client")
			}
		})
	}
}

func TestPublicPostsIncludeTheCover(t *testing.T) {
	cfg := testRouterConfig()
	posts := newFakePosts()
	posts.post.Cover = &domain.Cover{URL: "https://storage.googleapis.com/bucket/covers/a.jpg", Alt: "Un robot.", AIGenerated: true}
	cfg.Posts = posts
	router := newTestRouterWith(t, cfg)

	wantCover := `"cover":{"aiGenerated":true,"alt":"Un robot.","url":"https://storage.googleapis.com/bucket/covers/a.jpg"}`
	for _, path := range []string{"/api/v1/posts/" + testPostSlug, "/api/v1/posts"} {
		response := get(router, path)

		require.Equal(t, http.StatusOK, response.Code, path)
		assert.Contains(t, response.Body.String(), wantCover, path)
	}
}

func TestPostsWithoutCoverOmitIt(t *testing.T) {
	response := get(newContractRouter(t), "/api/v1/posts/"+testPostSlug)

	require.Equal(t, http.StatusOK, response.Code)
	assert.NotContains(t, response.Body.String(), `"cover"`)
}

func TestCoverPreviewHasItsOwnBuckets(t *testing.T) {
	t.Run("por minuto", func(t *testing.T) {
		router := bucketsRouter(t, RateLimits{Images: RateLimit{PerMinute: 2, Burst: 2}})

		for range 2 {
			assert.Equal(t, http.StatusOK, send(router, http.MethodPost, coverPreviewPath, "", adminSession()).Code)
		}

		response := send(router, http.MethodPost, coverPreviewPath, "", adminSession())
		requireProblem(t, response, http.StatusTooManyRequests)
		assert.Equal(t, "30", response.Header().Get("Retry-After"))

		assert.Equal(t, http.StatusOK, send(router, http.MethodPut, coverPostPath, acceptBody(testCoverImage, testCoverToken, "Alt."), adminSession()).Code,
			"accepting does not spend the image bucket")
		assert.Equal(t, http.StatusOK, send(router, http.MethodPost, "/api/v1/admin/assistant/suggest-cover", draftBody, adminSession()).Code,
			"nor does the assistant")
	})

	t.Run("por día", func(t *testing.T) {
		router := bucketsRouter(t, RateLimits{ImagesDaily: WindowLimit{Max: 3, Window: 24 * time.Hour}})

		for range 3 {
			assert.Equal(t, http.StatusOK, send(router, http.MethodPost, coverPreviewPath, "", adminSession()).Code)
		}

		response := send(router, http.MethodPost, coverPreviewPath, "", adminSession())
		requireProblem(t, response, http.StatusTooManyRequests)
		assert.Equal(t, "28800", response.Header().Get("Retry-After"), "one token every 8 hours")
	})
}
