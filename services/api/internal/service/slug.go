package service

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// MaxSlugLength es la longitud máxima de un slug, generado o enviado.
const MaxSlugLength = 80

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Slugify convierte un título en slug: minúsculas, sin acentos ni signos, con
// guiones entre palabras y como mucho MaxSlugLength caracteres, sin cortar
// palabras. Devuelve "" si el título no tiene letras ni números ASCII después
// de quitar los acentos, por ejemplo uno hecho solo de emojis.
func Slugify(title string) string {
	var builder strings.Builder

	pendingHyphen := false

	for _, r := range strings.ToLower(removeMarks(title)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if pendingHyphen {
				builder.WriteByte('-')
			}

			builder.WriteRune(r)

			pendingHyphen = false

			continue
		}

		// Cualquier otro carácter separa palabras. Solo se escribe el guion
		// cuando llega la siguiente letra: así no hay guiones repetidos, ni
		// al principio, ni al final.
		pendingHyphen = builder.Len() > 0
	}

	return truncateSlug(builder.String(), MaxSlugLength)
}

// removeMarks separa cada letra de su acento (NFD) y quita los acentos: "ñ"
// queda "n" y "ü" queda "u".
func removeMarks(text string) string {
	// Un transform.Transformer guarda estado, así que no se comparte entre
	// llamadas concurrentes: se crea uno por llamada.
	transformer := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

	result, _, err := transform.String(transformer, text)
	if err != nil {
		return text
	}

	return result
}

// truncateSlug corta el slug en el último guion que cabe en maxLength. Solo
// corta a mitad de palabra si la primera palabra ya es más larga que el límite.
func truncateSlug(slug string, maxLength int) string {
	if len(slug) <= maxLength {
		return slug
	}

	// El slug es ASCII, así que cada byte es un carácter.
	if slug[maxLength] == '-' {
		return slug[:maxLength]
	}

	cut := slug[:maxLength]
	if index := strings.LastIndexByte(cut, '-'); index > 0 {
		return cut[:index]
	}

	return cut
}

// slugWithSuffix devuelve el candidato número n: base para n = 1 y base-n
// para los demás, recortando base para no pasar de MaxSlugLength.
func slugWithSuffix(base string, n int) string {
	if n <= 1 {
		return base
	}

	suffix := "-" + strconv.Itoa(n)

	return strings.TrimSuffix(truncateSlug(base, MaxSlugLength-len(suffix)), "-") + suffix
}

// validSlug indica si un slug enviado por el cliente cumple el formato del contrato.
func validSlug(slug string) bool {
	return len(slug) <= MaxSlugLength && slugPattern.MatchString(slug)
}
