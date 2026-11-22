package imaging

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// halves es una imagen roja a la izquierda y azul a la derecha.
func halves(width, height int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		for x := range width {
			c := color.RGBA{R: 255, A: 255}
			if x >= width/2 {
				c = color.RGBA{B: 255, A: 255}
			}

			img.Set(x, y, c)
		}
	}

	return img
}

func encodeJPEG(t *testing.T, img image.Image) []byte {
	t.Helper()

	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}))

	return buf.Bytes()
}

func encodePNG(t *testing.T, img image.Image) []byte {
	t.Helper()

	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))

	return buf.Bytes()
}

// readFixture lee una WebP de testdata/, generada con cwebp a partir de una
// imagen sintética (ver testdata/README.md).
func readFixture(t *testing.T, name string) []byte {
	t.Helper()

	data, err := os.ReadFile("testdata/" + name) //nolint:gosec // Ruta fija del test.
	require.NoError(t, err)

	return data
}

func TestInspectDetectsTheFormatBySignature(t *testing.T) {
	for name, tt := range map[string]struct {
		data []byte
		want Format
	}{
		"jpeg":             {encodeJPEG(t, halves(1024, 1024)), Format{"jpeg", "image/jpeg", "jpg"}},
		"png":              {encodePNG(t, halves(1024, 576)), Format{"png", "image/png", "png"}},
		"webp con pérdida": {readFixture(t, "cover-lossy.webp"), Format{"webp", "image/webp", "webp"}},
		"webp sin pérdida": {readFixture(t, "cover-lossless.webp"), Format{"webp", "image/webp", "webp"}},
	} {
		t.Run(name, func(t *testing.T) {
			info, err := Inspect(tt.data)

			require.NoError(t, err)
			assert.Equal(t, tt.want, info.Format)
			assert.GreaterOrEqual(t, min(info.Width, info.Height), MinCoverShortSide)
		})
	}
}

func TestInspectReportsTheRealSize(t *testing.T) {
	info, err := Inspect(encodeJPEG(t, halves(1024, 1024)))

	require.NoError(t, err)
	assert.Equal(t, 1024, info.Width)
	assert.Equal(t, 1024, info.Height)
}

func TestInspectAcceptsTheMinimumShortSideInAnyOrientation(t *testing.T) {
	for name, size := range map[string][2]int{
		"cuadrada":   {MinCoverShortSide, MinCoverShortSide},
		"horizontal": {1024, MinCoverShortSide},
		"vertical":   {MinCoverShortSide, 1024},
	} {
		t.Run(name, func(t *testing.T) {
			info, err := Inspect(encodePNG(t, image.NewGray(image.Rect(0, 0, size[0], size[1]))))

			require.NoError(t, err)
			assert.Equal(t, size[0], info.Width)
			assert.Equal(t, size[1], info.Height)
		})
	}
}

func TestInspectRejects(t *testing.T) {
	jpegBytes := encodeJPEG(t, halves(1024, 576))

	for name, data := range map[string][]byte{
		"vacío":                 nil,
		"html":                  []byte("<!doctype html><script>alert(1)</script>"),
		"gif":                   []byte("GIF89a\x01\x00\x01\x00"),
		"firma de jpeg rota":    append([]byte{0xff, 0xd8, 0xff}, bytes.Repeat([]byte{0}, 64)...),
		"riff que no es webp":   []byte("RIFF\x00\x00\x00\x00WAVEfmt "),
		"demasiado chica":       encodePNG(t, halves(800, 450)),
		"alto bajo el mínimo":   encodePNG(t, image.NewGray(image.Rect(0, 0, 1024, MinCoverShortSide-1))),
		"ancho bajo el mínimo":  encodePNG(t, image.NewGray(image.Rect(0, 0, MinCoverShortSide-1, 1024))),
		"demasiado grande":      encodePNG(t, image.NewGray(image.Rect(0, 0, maxSide+1, 600))),
		"más de MaxBytes":       append(jpegBytes, make([]byte, MaxBytes)...),
		"jpeg con firma de png": append([]byte("\x89PNG\r\n\x1a\n"), jpegBytes...),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := Inspect(data)

			require.ErrorIs(t, err, ErrInvalidImage)
		})
	}
}

func TestBlurDataURLIsATinyPNG(t *testing.T) {
	for name, data := range map[string][]byte{
		"jpeg": encodeJPEG(t, halves(1024, 1024)),
		"png":  encodePNG(t, halves(1024, 576)),
		"webp": readFixture(t, "cover-lossy.webp"),
	} {
		t.Run(name, func(t *testing.T) {
			url, err := BlurDataURL(data)
			require.NoError(t, err)

			payload, ok := strings.CutPrefix(url, "data:image/png;base64,")
			require.True(t, ok, url)
			assert.Less(t, len(url), 2048, "the placeholder travels inside every post")

			raw, err := base64.StdEncoding.DecodeString(payload)
			require.NoError(t, err)

			img, err := png.Decode(bytes.NewReader(raw))
			require.NoError(t, err)
			assert.Equal(t, BlurWidth, img.Bounds().Dx())
		})
	}
}

func TestBlurKeepsTheProportionAndTheColors(t *testing.T) {
	url, err := BlurDataURL(encodePNG(t, halves(1024, 576)))
	require.NoError(t, err)

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(url, "data:image/png;base64,"))
	require.NoError(t, err)
	img, err := png.Decode(bytes.NewReader(raw))
	require.NoError(t, err)

	assert.Equal(t, 9, img.Bounds().Dy(), "16 × 9 for a 16:9 image")

	r, _, b, _ := img.At(0, 4).RGBA()
	assert.Greater(t, r, b, "left half stays red")

	r, _, b, _ = img.At(15, 4).RGBA()
	assert.Greater(t, b, r, "right half stays blue")
}

func TestBlurDataURLOfAcceptsSmallPublishedImages(t *testing.T) {
	url, err := BlurDataURLOf(encodePNG(t, halves(800, 450)))

	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(url, "data:image/png;base64,"))

	_, err = BlurDataURL(encodePNG(t, halves(800, 450)))
	require.ErrorIs(t, err, ErrInvalidImage, "a new cover still needs the minimum size")
}
