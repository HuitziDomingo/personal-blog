// Package imaging prepara y verifica las imágenes de portada (ADR-026, punto
// 8) solo con la biblioteca estándar: decodifica lo que devuelve el proveedor,
// lo recorta al tamaño de portada y lo codifica.
package imaging

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"net/http"

	// Registra el decodificador de PNG para image.Decode y DecodeConfig: el
	// proveedor documenta JPEG, pero un PNG también se acepta.
	_ "image/png"
)

const (
	// Width es el ancho fijo de una portada, 16:9.
	Width = 1024
	// Height es el alto fijo de una portada.
	Height = 576

	// ContentType es el formato en que se guarda una portada. ADR-026 pide
	// webp, pero la biblioteca estándar no lo codifica: hasta decidir el
	// codificador, se guarda en JPEG.
	ContentType = "image/jpeg"
	// Extension es la extensión de la clave de una portada en el almacén.
	Extension = "jpg"

	// MaxBytes es el tamaño máximo de una portada ya codificada. Una portada
	// de 1024 × 576 en JPEG con calidad 85 pesa unos 100 a 250 KiB; el límite
	// deja que su base64 quepa en el cuerpo por defecto de 1 MB.
	MaxBytes = 512 << 10

	// maxSourceSide limita el ancho y el alto de la imagen del proveedor antes
	// de decodificarla, para que una imagen enorme no agote la memoria.
	maxSourceSide = 4096

	jpegQuality = 85
)

// ErrInvalidImage indica bytes que no son una imagen utilizable.
var ErrInvalidImage = errors.New("invalid image")

// PrepareCover convierte la imagen del proveedor en una portada: comprueba su
// tipo por los bytes, recorta el centro a Width × Height y la codifica en
// ContentType. Una imagen más chica que la portada es un error: estirarla
// perdería calidad.
func PrepareCover(source []byte) ([]byte, error) {
	switch kind := http.DetectContentType(source); kind {
	case "image/jpeg", "image/png":
	default:
		return nil, fmt.Errorf("%w: unexpected type %s", ErrInvalidImage, kind)
	}

	config, _, err := image.DecodeConfig(bytes.NewReader(source))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	switch {
	case config.Width > maxSourceSide || config.Height > maxSourceSide:
		return nil, fmt.Errorf("%w: %dx%d is too large", ErrInvalidImage, config.Width, config.Height)
	case config.Width < Width || config.Height < Height:
		return nil, fmt.Errorf("%w: %dx%d is smaller than %dx%d", ErrInvalidImage, config.Width, config.Height, Width, Height)
	}

	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	cropped, err := cropCenter(decoded)
	if err != nil {
		return nil, err
	}

	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, cropped, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return nil, fmt.Errorf("encode cover: %w", err)
	}

	if encoded.Len() > MaxBytes {
		return nil, fmt.Errorf("%w: encoded cover has %d bytes, over %d", ErrInvalidImage, encoded.Len(), MaxBytes)
	}

	return encoded.Bytes(), nil
}

// subImager es lo que tienen en común los tipos de image que devuelven los
// decodificadores (*image.YCbCr, *image.RGBA, *image.NRGBA, ...): recortar sin
// copiar los píxeles.
type subImager interface {
	SubImage(r image.Rectangle) image.Image
}

// cropCenter recorta el centro de la imagen a Width × Height.
func cropCenter(source image.Image) (image.Image, error) {
	sub, ok := source.(subImager)
	if !ok {
		return nil, fmt.Errorf("%w: cannot crop %T", ErrInvalidImage, source)
	}

	bounds := source.Bounds()
	x := bounds.Min.X + (bounds.Dx()-Width)/2
	y := bounds.Min.Y + (bounds.Dy()-Height)/2

	return sub.SubImage(image.Rect(x, y, x+Width, y+Height)), nil
}

// VerifyCover comprueba, por sus bytes y sin decodificar los píxeles, que una
// portada que llega del cliente es un ContentType de Width × Height y de hasta
// MaxBytes (ADR-010: no se confía en el tipo que declara el cliente).
func VerifyCover(data []byte) error {
	if len(data) == 0 || len(data) > MaxBytes {
		return fmt.Errorf("%w: %d bytes", ErrInvalidImage, len(data))
	}

	if kind := http.DetectContentType(data); kind != ContentType {
		return fmt.Errorf("%w: unexpected type %s", ErrInvalidImage, kind)
	}

	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	if format != "jpeg" || config.Width != Width || config.Height != Height {
		return fmt.Errorf("%w: %s %dx%d", ErrInvalidImage, format, config.Width, config.Height)
	}

	return nil
}
