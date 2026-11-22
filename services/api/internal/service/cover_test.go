package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	stdpng "image/png"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/imaging"
)

const (
	testCoverUser    = "user-1"
	testCoverSubject = "Robots assembling a pipeline"
	testCoverAlt     = "Robots que arman una tubería."
)

var testCoverSecret = []byte("a-test-secret-of-at-least-32-bytes!!")

// fakeImageGenerator es el generador de imágenes para los tests (ADR-015):
// guarda los prompts y devuelve la imagen o el error configurados.
type fakeImageGenerator struct {
	prompts []string
	image   []byte
	err     error
	// block espera a que venza el contexto, como un proveedor lento.
	block bool
}

var _ domain.ImageGenerator = (*fakeImageGenerator)(nil)

func (f *fakeImageGenerator) Generate(ctx context.Context, prompt string) (domain.GeneratedImage, error) {
	f.prompts = append(f.prompts, prompt)

	if f.block {
		<-ctx.Done()

		return domain.GeneratedImage{Model: "fake"}, fmt.Errorf("%w: %w", domain.ErrImagesUnavailable, ctx.Err())
	}

	return domain.GeneratedImage{Data: f.image, Model: "fake"}, f.err
}

// fakeImageStore es el almacén para los tests: guarda las imágenes en memoria.
type fakeImageStore struct {
	stored []domain.StoredFile
	err    error
}

var _ domain.FileStore = (*fakeImageStore)(nil)

func (f *fakeImageStore) Put(_ context.Context, image domain.StoredFile) (string, error) {
	if f.err != nil {
		return "", f.err
	}

	f.stored = append(f.stored, image)

	return "https://storage.example/" + image.Key, nil
}

// fakeCoverSuggester es el asistente ya validado: devuelve una idea fija.
type fakeCoverSuggester struct {
	drafts     []domain.Draft
	suggestion domain.CoverSuggestion
	err        error
}

func (f *fakeCoverSuggester) SuggestCover(_ context.Context, draft domain.Draft) (domain.CoverSuggestion, error) {
	f.drafts = append(f.drafts, draft)

	return f.suggestion, f.err
}

// testJPEG es una imagen de width × height con tres franjas horizontales:
// roja arriba, verde en el centro y azul abajo.
func testJPEG(t *testing.T, width, height int) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		stripe := color.RGBA{R: 255, A: 255}
		switch {
		case y >= 2*height/3:
			stripe = color.RGBA{B: 255, A: 255}
		case y >= height/3:
			stripe = color.RGBA{G: 255, A: 255}
		}

		for x := range width {
			img.Set(x, y, stripe)
		}
	}

	var encoded bytes.Buffer
	require.NoError(t, jpeg.Encode(&encoded, img, nil))

	return encoded.Bytes()
}

type coverFixture struct {
	service   *CoverService
	posts     *fakePostRepository
	assistant *fakeCoverSuggester
	generator *fakeImageGenerator
	store     *fakeImageStore
	clock     *testClock
	logs      *bytes.Buffer
	postID    string
}

func newCoverFixture(t *testing.T) coverFixture {
	t.Helper()

	f := coverFixture{
		posts:     newFakePostRepository(),
		assistant: &fakeCoverSuggester{suggestion: domain.CoverSuggestion{Subject: testCoverSubject, Alt: testCoverAlt}},
		generator: &fakeImageGenerator{image: testJPEG(t, 1024, 1024)},
		store:     &fakeImageStore{},
		clock:     &testClock{now: time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)},
		logs:      &bytes.Buffer{},
	}

	f.postID = f.posts.insert(&domain.Post{Title: "Agentes", Content: "# Agentes\n\nOrquestación.", Status: domain.PostStatusDraft})

	service, err := NewCoverService(CoverDeps{
		Posts:     f.posts,
		Assistant: f.assistant,
		Generator: f.generator,
		Store:     f.store,
		Secret:    testCoverSecret,
		Timeout:   time.Second,
		Logger:    slog.New(slog.NewTextHandler(f.logs, nil)),
		Now:       f.clock.Now,
	})
	require.NoError(t, err)

	f.service = service

	return f
}

func (f coverFixture) preview(t *testing.T) CoverPreview {
	t.Helper()

	preview, err := f.service.Preview(t.Context(), testCoverUser, f.postID)
	require.NoError(t, err)

	return preview
}

func TestCoverPreview(t *testing.T) {
	f := newCoverFixture(t)

	preview := f.preview(t)

	assert.Equal(t, []domain.Draft{{Title: "Agentes", Content: "# Agentes\n\nOrquestación."}}, f.assistant.drafts, "only the saved post goes to Gemini")
	assert.Equal(t, []string{CoverPrompt(testCoverSubject)}, f.generator.prompts)
	assert.Equal(t, testCoverSubject, preview.Subject)
	assert.Equal(t, testCoverAlt, preview.Alt)
	assert.Equal(t, "image/jpeg", preview.ContentType)
	assert.Equal(t, 1024, preview.Width)
	assert.Equal(t, 1024, preview.Height, "the provider image as is, without cropping")
	assert.Equal(t, f.clock.Now().Add(CoverPreviewTTL), preview.ExpiresAt)
	assert.Equal(t, f.generator.image, preview.Image, "never re-encoded")
	assert.Empty(t, f.store.stored, "a preview is never stored (ADR-026, point 4)")

	stored, err := f.posts.GetByID(t.Context(), f.postID)
	require.NoError(t, err)
	assert.Nil(t, stored.Cover)

	assert.Contains(t, f.logs.String(), "result=ok")
	assert.NotContains(t, f.logs.String(), testCoverSubject, "the log never has the prompt")
}

func TestCoverPromptIsAClosedTemplate(t *testing.T) {
	prompt := CoverPrompt(testCoverSubject)

	assert.Contains(t, prompt, "about: "+testCoverSubject+".")
	for _, rule := range []string{"No people", "no real persons", "No brands, no logos", "No text", "Not in the style of any named artist"} {
		assert.Contains(t, prompt, rule)
	}
}

func TestCoversDisabled(t *testing.T) {
	covers := NewDisabledCovers()

	_, err := covers.Preview(t.Context(), testCoverUser, "post-1")
	require.ErrorIs(t, err, domain.ErrImagesDisabled)

	_, err = covers.Accept(t.Context(), testCoverUser, "post-1", CoverAcceptance{})
	require.ErrorIs(t, err, domain.ErrImagesDisabled)
}

func TestNewCoverServiceNeedsEveryPiece(t *testing.T) {
	valid := CoverDeps{
		Posts: newFakePostRepository(), Assistant: &fakeCoverSuggester{}, Generator: &fakeImageGenerator{}, Store: &fakeImageStore{},
		Secret: testCoverSecret, Timeout: time.Second, Logger: slog.Default(), Now: time.Now,
	}

	for name, change := range map[string]func(*CoverDeps){
		"sin generador": func(d *CoverDeps) { d.Generator = nil },
		"sin almacén":   func(d *CoverDeps) { d.Store = nil },
		"sin asistente": func(d *CoverDeps) { d.Assistant = nil },
		"sin timeout":   func(d *CoverDeps) { d.Timeout = 0 },
		"sin secreto":   func(d *CoverDeps) { d.Secret = nil },
		"sin logger":    func(d *CoverDeps) { d.Logger = nil },
		"sin posts":     func(d *CoverDeps) { d.Posts = nil },
		"sin reloj":     func(d *CoverDeps) { d.Now = nil },
	} {
		t.Run(name, func(t *testing.T) {
			deps := valid
			change(&deps)

			_, err := NewCoverService(deps)
			require.Error(t, err)
		})
	}
}

func TestCoverPreviewFailures(t *testing.T) {
	tests := []struct {
		name       string
		setup      func(t *testing.T, f coverFixture)
		postID     string
		wantErr    error
		wantResult string
		generated  bool
	}{
		{
			name:    "post inexistente",
			postID:  "post-404",
			wantErr: domain.ErrNotFound,
		},
		{
			name:    "el asistente falla",
			setup:   func(_ *testing.T, f coverFixture) { f.assistant.err = domain.ErrAssistantUnavailable },
			wantErr: domain.ErrAssistantUnavailable,
		},
		{
			name: "cuota agotada",
			setup: func(_ *testing.T, f coverFixture) {
				f.generator.err = fmt.Errorf("%w: code 3036", domain.ErrImagesQuotaExceeded)
			},
			wantErr:    domain.ErrImagesQuotaExceeded,
			wantResult: "quota_exceeded",
			generated:  true,
		},
		{
			name: "el proveedor falla",
			setup: func(_ *testing.T, f coverFixture) {
				f.generator.err = fmt.Errorf("%w: status 500", domain.ErrImagesUnavailable)
			},
			wantErr:    domain.ErrImagesUnavailable,
			wantResult: "unavailable",
			generated:  true,
		},
		{
			name:       "timeout",
			setup:      func(_ *testing.T, f coverFixture) { f.generator.block = true },
			wantErr:    domain.ErrImagesUnavailable,
			wantResult: "timeout",
			generated:  true,
		},
		{
			name:       "no es una imagen",
			setup:      func(_ *testing.T, f coverFixture) { f.generator.image = []byte("<html>nope</html>") },
			wantErr:    domain.ErrImagesUnavailable,
			wantResult: "invalid_output",
			generated:  true,
		},
		{
			name:       "imagen más chica que la portada",
			setup:      func(t *testing.T, f coverFixture) { f.generator.image = testJPEG(t, 1024, imaging.MinCoverShortSide-1) },
			wantErr:    domain.ErrImagesUnavailable,
			wantResult: "invalid_output",
			generated:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newCoverFixture(t)
			f.service.deps.Timeout = 10 * time.Millisecond
			if tt.setup != nil {
				tt.setup(t, f)
			}

			postID := f.postID
			if tt.postID != "" {
				postID = tt.postID
			}

			_, err := f.service.Preview(t.Context(), testCoverUser, postID)

			require.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.generated, len(f.generator.prompts) == 1, "one call at most, without retries")
			assert.Empty(t, f.store.stored)

			if tt.wantResult != "" {
				assert.Contains(t, f.logs.String(), "result="+tt.wantResult)
				assert.Contains(t, f.logs.String(), "level=WARN")
			}
		})
	}
}

func TestAcceptCover(t *testing.T) {
	f := newCoverFixture(t)
	preview := f.preview(t)
	f.clock.Advance(10 * time.Minute)

	post, err := f.service.Accept(t.Context(), testCoverUser, f.postID, CoverAcceptance{Image: preview.Image, Token: preview.Token, Alt: "  Robots editados.  "})
	require.NoError(t, err)

	require.Len(t, f.store.stored, 1)
	stored := f.store.stored[0]
	assert.Regexp(t, `^covers/`+f.postID+`/[0-9a-f]{24}\.jpg$`, stored.Key)
	assert.Equal(t, "image/jpeg", stored.ContentType)
	assert.Equal(t, preview.Image, stored.Data, "stored exactly as the provider returned it")
	assert.Equal(t, "inline", stored.ContentDisposition)

	require.NotNil(t, post.Cover)
	assert.True(t, strings.HasPrefix(post.Cover.BlurDataURL, "data:image/png;base64,"))
	assert.Less(t, len(post.Cover.BlurDataURL), 2048)

	want := &domain.Cover{URL: "https://storage.example/" + stored.Key, Alt: "Robots editados.", AIGenerated: true, BlurDataURL: post.Cover.BlurDataURL}
	assert.Equal(t, want, post.Cover)
	assert.Equal(t, f.clock.Now(), post.UpdatedAt)

	saved, err := f.posts.GetByID(t.Context(), f.postID)
	require.NoError(t, err)
	assert.Equal(t, want, saved.Cover)
}

func TestAcceptCoverDoesNotTrustTheClient(t *testing.T) {
	tampered := func(image []byte) []byte {
		changed := bytes.Clone(image)
		changed[len(changed)/2] ^= 0xff

		return changed
	}

	tests := map[string]func(f coverFixture, preview CoverPreview) (string, string, CoverAcceptance){
		"imagen cambiada": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			return testCoverUser, f.postID, CoverAcceptance{Image: tampered(p.Image), Token: p.Token, Alt: testCoverAlt}
		},
		"otro post": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			other := f.posts.insert(&domain.Post{Title: "Otro", Content: "Otro."})

			return testCoverUser, other, CoverAcceptance{Image: p.Image, Token: p.Token, Alt: testCoverAlt}
		},
		"otro usuario": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			return "user-2", f.postID, CoverAcceptance{Image: p.Image, Token: p.Token, Alt: testCoverAlt}
		},
		"vencimiento cambiado": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			_, signature, _ := strings.Cut(p.Token, ".")

			return testCoverUser, f.postID, CoverAcceptance{Image: p.Image, Token: "99999999999." + signature, Alt: testCoverAlt}
		},
		"vencida": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			f.clock.Advance(CoverPreviewTTL)

			return testCoverUser, f.postID, CoverAcceptance{Image: p.Image, Token: p.Token, Alt: testCoverAlt}
		},
		"token mal formado": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			return testCoverUser, f.postID, CoverAcceptance{Image: p.Image, Token: "nope", Alt: testCoverAlt}
		},
		"firma que no es base64": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			return testCoverUser, f.postID, CoverAcceptance{Image: p.Image, Token: "1.***", Alt: testCoverAlt}
		},
		"firma de otra clave": func(f coverFixture, p CoverPreview) (string, string, CoverAcceptance) {
			other, _ := newPreviewSigner([]byte("another-secret-of-at-least-32-bytes"))

			return testCoverUser, f.postID, CoverAcceptance{Image: p.Image, Token: other.sign(testCoverUser, f.postID, p.Image, p.ExpiresAt), Alt: testCoverAlt}
		},
	}

	for name, build := range tests {
		t.Run(name, func(t *testing.T) {
			f := newCoverFixture(t)
			userID, postID, acceptance := build(f, f.preview(t))

			_, err := f.service.Accept(t.Context(), userID, postID, acceptance)

			require.ErrorIs(t, err, domain.ErrInvalidCoverPreview)
			assert.Empty(t, f.store.stored)
		})
	}
}

// Una firma válida sobre bytes que no son una portada (por ejemplo, si la
// clave se filtrara) tampoco pasa: los bytes se verifican de nuevo.
func TestAcceptCoverVerifiesTheBytes(t *testing.T) {
	f := newCoverFixture(t)
	notACover := testJPEG(t, imaging.MinCoverShortSide-1, 1024)
	token := f.service.signer.sign(testCoverUser, f.postID, notACover, f.clock.Now().Add(time.Minute))

	_, err := f.service.Accept(t.Context(), testCoverUser, f.postID, CoverAcceptance{Image: notACover, Token: token, Alt: testCoverAlt})

	require.ErrorIs(t, err, domain.ErrInvalidCoverPreview)
	require.ErrorIs(t, err, imaging.ErrInvalidImage)
	assert.Empty(t, f.store.stored)
}

func TestAcceptCoverValidatesTheAlt(t *testing.T) {
	for name, alt := range map[string]string{
		"vacío":           "   ",
		"con salto":       "Hola\nmundo",
		"con etiqueta":    "<b>Hola</b>",
		"demasiado largo": strings.Repeat("a", MaxCoverAltLength+1),
	} {
		t.Run(name, func(t *testing.T) {
			f := newCoverFixture(t)
			preview := f.preview(t)

			_, err := f.service.Accept(t.Context(), testCoverUser, f.postID, CoverAcceptance{Image: preview.Image, Token: preview.Token, Alt: alt})

			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Empty(t, f.store.stored)
		})
	}
}

func TestAcceptCoverWhenTheStoreFails(t *testing.T) {
	f := newCoverFixture(t)
	preview := f.preview(t)
	f.store.err = errors.New("gcs put: status 403")

	_, err := f.service.Accept(t.Context(), testCoverUser, f.postID, CoverAcceptance{Image: preview.Image, Token: preview.Token, Alt: testCoverAlt})

	require.ErrorIs(t, err, domain.ErrCoverStoreUnavailable)

	saved, err := f.posts.GetByID(t.Context(), f.postID)
	require.NoError(t, err)
	assert.Nil(t, saved.Cover, "the post keeps no cover")
}

func TestAcceptCoverForAMissingPost(t *testing.T) {
	f := newCoverFixture(t)
	preview := f.preview(t)
	token := f.service.signer.sign(testCoverUser, "post-404", preview.Image, preview.ExpiresAt)

	_, err := f.service.Accept(t.Context(), testCoverUser, "post-404", CoverAcceptance{Image: preview.Image, Token: token, Alt: testCoverAlt})

	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.Empty(t, f.store.stored)
}

func TestPostServiceRemoveCover(t *testing.T) {
	f := newPostFixture()
	post, err := f.service.Create(t.Context(), testAuthorID, draftInput("Con portada"))
	require.NoError(t, err)

	post.Cover = &domain.Cover{URL: "https://storage.example/a.jpg", Alt: "A.", AIGenerated: true}
	require.NoError(t, f.posts.Update(t.Context(), post))
	f.clock.Advance(time.Hour)

	require.NoError(t, f.service.RemoveCover(t.Context(), post.ID))

	saved, err := f.posts.GetByID(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Nil(t, saved.Cover)
	assert.Equal(t, f.clock.Now(), saved.UpdatedAt)

	f.clock.Advance(time.Hour)
	require.NoError(t, f.service.RemoveCover(t.Context(), post.ID), "removing twice is a no-op")
	again, err := f.posts.GetByID(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, saved.UpdatedAt, again.UpdatedAt)

	require.ErrorIs(t, f.service.RemoveCover(t.Context(), "post-404"), domain.ErrNotFound)
}

func TestPostUpdateKeepsTheCover(t *testing.T) {
	f := newPostFixture()
	post, err := f.service.Create(t.Context(), testAuthorID, draftInput("Con portada"))
	require.NoError(t, err)

	cover := &domain.Cover{URL: "https://storage.example/a.jpg", Alt: "A.", AIGenerated: true}
	post.Cover = cover
	require.NoError(t, f.posts.Update(t.Context(), post))

	updated, err := f.service.Update(t.Context(), post.ID, draftInput("Título nuevo"))
	require.NoError(t, err)
	assert.Equal(t, cover, updated.Cover, "editing a post never drops its cover")
}

// El proveedor puede devolver JPEG, PNG o WebP: se guarda con su tipo y su
// extensión, detectados por la firma de los bytes.
func TestAcceptCoverKeepsTheProviderFormat(t *testing.T) {
	webp, err := os.ReadFile("../imaging/testdata/cover-lossy.webp")
	require.NoError(t, err)

	var png bytes.Buffer
	require.NoError(t, stdpng.Encode(&png, image.NewRGBA(image.Rect(0, 0, 1024, 576))))

	for name, tt := range map[string]struct {
		image       []byte
		contentType string
		extension   string
	}{
		"png":  {png.Bytes(), "image/png", "png"},
		"webp": {webp, "image/webp", "webp"},
	} {
		t.Run(name, func(t *testing.T) {
			f := newCoverFixture(t)
			f.generator.image = tt.image
			preview := f.preview(t)

			post, err := f.service.Accept(t.Context(), testCoverUser, f.postID, CoverAcceptance{Image: preview.Image, Token: preview.Token, Alt: testCoverAlt})
			require.NoError(t, err)

			require.Len(t, f.store.stored, 1)
			assert.Equal(t, tt.contentType, preview.ContentType)
			assert.Equal(t, tt.contentType, f.store.stored[0].ContentType)
			assert.Regexp(t, `\.`+tt.extension+`$`, f.store.stored[0].Key)
			assert.Equal(t, tt.image, f.store.stored[0].Data)
			assert.NotEmpty(t, post.Cover.BlurDataURL)
		})
	}
}

// La clave de las vistas previas sale de JWT_SECRET con HKDF-SHA256 y la
// etiqueta "cover-preview-v1". El test la calcula aparte, con HMAC según RFC
// 5869 (extract con sal de ceros y un solo bloque de expand), y fija el valor
// para que un cambio de etiqueta o de parámetros no pase sin verse.
func TestCoverPreviewKeyIsHKDFOfTheSecret(t *testing.T) {
	key, err := deriveCoverPreviewKey(testCoverSecret)
	require.NoError(t, err)

	extract := hmac.New(sha256.New, make([]byte, sha256.Size))
	extract.Write(testCoverSecret)
	expand := hmac.New(sha256.New, extract.Sum(nil))
	expand.Write([]byte("cover-preview-v1"))
	expand.Write([]byte{1})

	assert.Equal(t, expand.Sum(nil), key)
	assert.Equal(t, "2622f7b63531329d31bb34d45e88227769af2a4e5b40b13b9ec2a99dd566c53a", hex.EncodeToString(key))

	other, err := deriveCoverPreviewKey([]byte("another-secret-of-at-least-32-bytes"))
	require.NoError(t, err)
	assert.NotEqual(t, key, other)

	signer, err := newPreviewSigner(testCoverSecret)
	require.NoError(t, err)
	assert.Equal(t, key, signer.key)
	assert.NotEqual(t, testCoverSecret, signer.key, "the JWT secret is never used directly")
}
