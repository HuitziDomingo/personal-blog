// Package imaging verifica las imágenes de portada y genera su placeholder
// borroso (ADR-026). La imagen del proveedor se guarda tal cual: aquí no se
// recodifica ni se recorta (el recorte 16:9 lo hace la web). JPEG y PNG se
// decodifican con la biblioteca estándar y WebP con golang.org/x/image/webp,
// solo para leer sus dimensiones y generar el placeholder.
package imaging

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"

	// Registra el decodificador de JPEG en image.Decode y DecodeConfig.
	_ "image/jpeg"

	// Registra el decodificador de WebP en image.Decode y DecodeConfig: solo
	// decodifica, la API nunca escribe WebP.
	_ "golang.org/x/image/webp"
)

const (
	// MaxBytes es el tamaño máximo de una portada. FLUX.1 [schnell] devuelve
	// una imagen de unos cientos de KiB; 2 MiB cubre un PNG de 1024 × 1024.
	MaxBytes = 2 << 20

	// MinCoverShortSide es el mínimo del lado más corto de una portada, en
	// cualquier orientación. Es provisional: se ajusta con la resolución real
	// que registre make api-cover-sample (ADR-029, punto 5).
	MinCoverShortSide = 512

	// maxSide limita el ancho y el alto antes de decodificar los píxeles, para
	// que una imagen enorme no agote la memoria.
	maxSide = 4096

	// BlurWidth es el ancho del placeholder borroso: unos cientos de bytes en
	// base64, que van dentro del post.
	BlurWidth = 16
)

// ErrInvalidImage indica bytes que no son una imagen utilizable.
var ErrInvalidImage = errors.New("invalid image")

// Format es un formato de portada aceptado.
type Format struct {
	// Name es el nombre que registra el decodificador ("jpeg", "png", "webp").
	Name        string
	ContentType string
	Extension   string
}

// formats son los formatos aceptados, cada uno con su firma de bytes.
var formats = []struct {
	Format
	matches func([]byte) bool
}{
	{Format{"jpeg", "image/jpeg", "jpg"}, func(b []byte) bool { return bytes.HasPrefix(b, []byte{0xff, 0xd8, 0xff}) }},
	{Format{"png", "image/png", "png"}, func(b []byte) bool { return bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")) }},
	{Format{"webp", "image/webp", "webp"}, func(b []byte) bool {
		return len(b) >= 12 && bytes.Equal(b[:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP"))
	}},
}

// Info es lo que se sabe de una portada sin decodificar sus píxeles.
type Info struct {
	Format
	Width  int
	Height int
}

// Inspect comprueba, por sus bytes y no por el tipo que declare nadie
// (ADR-010), que data es un JPEG, PNG o WebP de hasta MaxBytes, de al menos
// MinCoverShortSide en su lado más corto y de no más de maxSide por lado.
func Inspect(data []byte) (Info, error) {
	if len(data) == 0 || len(data) > MaxBytes {
		return Info{}, fmt.Errorf("%w: %d bytes", ErrInvalidImage, len(data))
	}

	format, ok := detect(data)
	if !ok {
		return Info{}, fmt.Errorf("%w: unknown signature", ErrInvalidImage)
	}

	config, name, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Info{}, fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	switch {
	case name != format.Name:
		return Info{}, fmt.Errorf("%w: signature says %s but decodes as %s", ErrInvalidImage, format.Name, name)
	case config.Width > maxSide || config.Height > maxSide:
		return Info{}, fmt.Errorf("%w: %dx%d is too large", ErrInvalidImage, config.Width, config.Height)
	case min(config.Width, config.Height) < MinCoverShortSide:
		return Info{}, fmt.Errorf("%w: %dx%d has a side shorter than %d", ErrInvalidImage, config.Width, config.Height, MinCoverShortSide)
	}

	return Info{Format: format, Width: config.Width, Height: config.Height}, nil
}

func detect(data []byte) (Format, bool) {
	for _, f := range formats {
		if f.matches(data) {
			return f.Format, true
		}
	}

	return Format{}, false
}

// BlurDataURL devuelve un placeholder diminuto de la imagen, BlurWidth píxeles
// de ancho con su proporción, como data:image/png;base64. La web lo muestra
// borroso mientras carga la portada (placeholder="blur" de next/image).
// Comprueba la imagen con Inspect antes de decodificarla.
func BlurDataURL(data []byte) (string, error) {
	if _, err := Inspect(data); err != nil {
		return "", err
	}

	return blurOf(data)
}

// blurOf decodifica y reduce sin los límites de tamaño de portada: lo usa
// también la migración de las portadas existentes, que son más chicas.
func blurOf(data []byte) (string, error) {
	if _, ok := detect(data); !ok {
		return "", fmt.Errorf("%w: unknown signature", ErrInvalidImage)
	}

	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	if config.Width > maxSide || config.Height > maxSide || config.Width < 1 || config.Height < 1 {
		return "", fmt.Errorf("%w: %dx%d", ErrInvalidImage, config.Width, config.Height)
	}

	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidImage, err)
	}

	var encoded bytes.Buffer
	if err := png.Encode(&encoded, shrink(decoded, BlurWidth)); err != nil {
		return "", fmt.Errorf("encode blur placeholder: %w", err)
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes()), nil
}

// BlurDataURLOf es BlurDataURL sin el mínimo de tamaño de portada, para
// imágenes que ya están publicadas (por ejemplo, las de los posts migrados).
func BlurDataURLOf(data []byte) (string, error) {
	if len(data) == 0 || len(data) > MaxBytes {
		return "", fmt.Errorf("%w: %d bytes", ErrInvalidImage, len(data))
	}

	return blurOf(data)
}

// shrink reduce la imagen a width píxeles de ancho promediando cada bloque de
// píxeles de origen (box filter). Para un placeholder borroso basta, y evita
// depender de golang.org/x/image/draw.
func shrink(source image.Image, width int) image.Image {
	bounds := source.Bounds()
	width = min(width, bounds.Dx())
	height := max(1, bounds.Dy()*width/bounds.Dx())
	out := image.NewNRGBA(image.Rect(0, 0, width, height))

	for y := range height {
		y0 := bounds.Min.Y + y*bounds.Dy()/height
		y1 := bounds.Min.Y + (y+1)*bounds.Dy()/height

		for x := range width {
			x0 := bounds.Min.X + x*bounds.Dx()/width
			x1 := bounds.Min.X + (x+1)*bounds.Dx()/width

			var r, g, b, a, n uint64

			for sy := y0; sy < y1; sy++ {
				for sx := x0; sx < x1; sx++ {
					cr, cg, cb, ca := source.At(sx, sy).RGBA()
					r, g, b, a = r+uint64(cr), g+uint64(cg), b+uint64(cb), a+uint64(ca)
					n++
				}
			}

			// RGBA() devuelve valores premultiplicados de 16 bits; el promedio
			// cabe en uint16.
			out.Set(x, y, color.RGBA64{R: uint16(r / n), G: uint16(g / n), B: uint16(b / n), A: uint16(a / n)}) //nolint:gosec // Promedio de valores de 16 bits.
		}
	}

	return out
}
