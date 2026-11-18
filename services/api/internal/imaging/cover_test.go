package imaging

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	red   = color.RGBA{R: 255, A: 255}
	green = color.RGBA{G: 255, A: 255}
	blue  = color.RGBA{B: 255, A: 255}
)

// striped es una imagen con tres franjas horizontales: roja arriba, verde en
// el centro y azul abajo. Al recortar el centro solo debe quedar verde.
func striped(width, height int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		stripe := red
		switch {
		case y >= height-(height-Height)/2:
			stripe = blue
		case y >= (height-Height)/2:
			stripe = green
		}

		for x := range width {
			img.Set(x, y, stripe)
		}
	}

	return img
}

func encodeJPEG(t *testing.T, img image.Image) []byte {
	t.Helper()

	var buffer bytes.Buffer
	require.NoError(t, jpeg.Encode(&buffer, img, &jpeg.Options{Quality: 95}))

	return buffer.Bytes()
}

func encodePNG(t *testing.T, img image.Image) []byte {
	t.Helper()

	var buffer bytes.Buffer
	require.NoError(t, png.Encode(&buffer, img))

	return buffer.Bytes()
}

// pngHeader es la cabecera de un PNG que declara width × height, sin píxeles:
// DecodeConfig la lee y Decode fallaría.
func pngHeader(t *testing.T, width, height uint32) []byte {
	t.Helper()

	full := encodePNG(t, image.NewGray(image.Rect(0, 0, 1, 1)))
	header := bytes.Clone(full[:33])
	binary.BigEndian.PutUint32(header[16:20], width)
	binary.BigEndian.PutUint32(header[20:24], height)
	// El CRC de IHDR cubre el tipo y los datos del chunk: sin recalcularlo,
	// DecodeConfig fallaría por el checksum y no por el tamaño.
	binary.BigEndian.PutUint32(header[29:33], crc32.ChecksumIEEE(header[12:29]))

	return header
}

func assertMostlyGreen(t *testing.T, cover []byte) {
	t.Helper()

	decoded, err := jpeg.Decode(bytes.NewReader(cover))
	require.NoError(t, err)
	require.Equal(t, image.Rect(0, 0, Width, Height), decoded.Bounds())

	for _, point := range []image.Point{{0, 0}, {Width / 2, Height / 2}, {Width - 1, Height - 1}} {
		r, g, b, _ := decoded.At(point.X, point.Y).RGBA()
		assert.Greater(t, g, r, "point %v", point)
		assert.Greater(t, g, b, "point %v", point)
	}
}

func TestPrepareCoverCropsTheCenter(t *testing.T) {
	for name, source := range map[string][]byte{
		"jpeg cuadrado":  encodeJPEG(t, striped(1024, 1024)),
		"png cuadrado":   encodePNG(t, striped(1024, 1024)),
		"jpeg más ancho": encodeJPEG(t, striped(1280, 720)),
		"jpeg exacto":    encodeJPEG(t, striped(Width, Height)),
	} {
		t.Run(name, func(t *testing.T) {
			cover, err := PrepareCover(source)
			require.NoError(t, err)

			require.NoError(t, VerifyCover(cover))
			assertMostlyGreen(t, cover)
		})
	}
}

func TestPrepareCoverRejectsUnusableImages(t *testing.T) {
	for name, source := range map[string][]byte{
		"vacío":              nil,
		"html":               []byte("<html><body>error</body></html>"),
		"gif":                []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;"),
		"jpeg truncado":      encodeJPEG(t, striped(1024, 1024))[:200],
		"más chico":          encodeJPEG(t, striped(800, 800)),
		"más bajo":           encodeJPEG(t, striped(1024, 500)),
		"demasiado grande":   pngHeader(t, 20000, 20000),
		"cabecera sin datos": pngHeader(t, 1024, 1024),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := PrepareCover(source)

			require.ErrorIs(t, err, ErrInvalidImage)
		})
	}
}

func TestVerifyCover(t *testing.T) {
	cover, err := PrepareCover(encodeJPEG(t, striped(1024, 1024)))
	require.NoError(t, err)
	require.NoError(t, VerifyCover(cover))

	for name, data := range map[string][]byte{
		"vacía":           nil,
		"otro tamaño":     encodeJPEG(t, striped(1024, 1024)),
		"png del tamaño":  encodePNG(t, striped(Width, Height)),
		"no es imagen":    []byte("hello"),
		"jpeg truncado":   cover[:2],
		"más de MaxBytes": append(bytes.Clone(cover), make([]byte, MaxBytes)...),
	} {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, VerifyCover(data), ErrInvalidImage)
		})
	}
}
