package service

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// DefaultChunkMaxChars es el tamaño máximo por defecto de un fragmento, en
// caracteres (ADR-027, punto 3).
const DefaultChunkMaxChars = 800

// TextChunk es un fragmento de un post antes de generar su embedding.
type TextChunk struct {
	// Section es el título del ## al que pertenece; vacío para el texto antes
	// del primer ##.
	Section string
	Text    string
}

// SplitMarkdown divide el Markdown de un post en fragmentos (ADR-027, punto
// 3): una sección por cada encabezado ## y, dentro de cada sección, bloques
// (párrafos, listas, bloques de código) agrupados hasta maxChars caracteres.
//
// Un bloque de código nunca se corta: si es más largo que maxChars, queda
// solo en un fragmento más largo. Un párrafo más largo que maxChars se corta
// por palabras. Los ## dentro de un bloque de código no abren sección. Las
// secciones vacías no producen fragmentos.
func SplitMarkdown(content string, maxChars int) []TextChunk {
	if maxChars <= 0 {
		maxChars = DefaultChunkMaxChars
	}

	var chunks []TextChunk
	for _, section := range splitSections(content) {
		for _, text := range packBlocks(section.blocks, maxChars) {
			chunks = append(chunks, TextChunk{Section: section.title, Text: text})
		}
	}

	return chunks
}

type markdownSection struct {
	title  string
	blocks []markdownBlock
}

type markdownBlock struct {
	text string
	// code indica un bloque de código cercado, que no se corta.
	code bool
}

// splitSections recorre las líneas una vez, con el estado del bloque de
// código abierto, y arma las secciones con sus bloques.
func splitSections(content string) []markdownSection {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	sections := []markdownSection{{}}
	var paragraph []string
	var code []string
	var fence string // el delimitador del bloque abierto, o "" si no hay.

	current := func() *markdownSection { return &sections[len(sections)-1] }

	flushParagraph := func() {
		text := strings.TrimSpace(strings.Join(paragraph, "\n"))
		paragraph = paragraph[:0]
		if text != "" {
			current().blocks = append(current().blocks, markdownBlock{text: text})
		}
	}

	for _, line := range strings.Split(content, "\n") {
		if fence != "" {
			code = append(code, line)
			if closesFence(line, fence) {
				current().blocks = append(current().blocks, markdownBlock{text: strings.Join(code, "\n"), code: true})
				code, fence = nil, ""
			}

			continue
		}

		if opening := openingFence(line); opening != "" {
			flushParagraph()
			fence = opening
			code = []string{line}

			continue
		}

		if title, ok := sectionHeading(line); ok {
			flushParagraph()
			sections = append(sections, markdownSection{title: title})

			continue
		}

		if strings.TrimSpace(line) == "" {
			flushParagraph()

			continue
		}

		paragraph = append(paragraph, line)
	}

	// Un bloque de código sin cerrar llega hasta el final del post, como lo
	// renderiza CommonMark.
	if fence != "" {
		current().blocks = append(current().blocks, markdownBlock{text: strings.Join(code, "\n"), code: true})
	}

	flushParagraph()

	return sections
}

// openingFence devuelve el delimitador (``` o ~~~, de 3 o más) si la línea
// abre un bloque de código, con hasta 3 espacios de sangría.
func openingFence(line string) string {
	trimmed, ok := trimIndent(line)
	if !ok {
		return ""
	}

	for _, char := range []string{"`", "~"} {
		n := len(trimmed) - len(strings.TrimLeft(trimmed, char))
		if n >= 3 {
			// Un ``` con otra ` en la info string no abre un bloque.
			if char == "`" && strings.Contains(trimmed[n:], "`") {
				return ""
			}

			return trimmed[:n]
		}
	}

	return ""
}

// closesFence indica si la línea cierra el bloque: el mismo carácter, al
// menos tan largo como el que lo abrió y nada más que espacios después.
func closesFence(line, fence string) bool {
	trimmed, ok := trimIndent(line)
	if !ok {
		return false
	}

	n := len(trimmed) - len(strings.TrimLeft(trimmed, fence[:1]))

	return n >= len(fence) && strings.TrimSpace(trimmed[n:]) == ""
}

// sectionHeading reconoce un encabezado ## (no ### ni #) y devuelve su
// título sin los # de cierre opcionales.
func sectionHeading(line string) (string, bool) {
	trimmed, ok := trimIndent(line)
	if !ok || !strings.HasPrefix(trimmed, "##") {
		return "", false
	}

	rest := trimmed[2:]
	if rest != "" && rest[0] != ' ' && rest[0] != '\t' {
		// ### u otro texto pegado: no es un ##.
		return "", false
	}

	title := strings.TrimSpace(rest)
	title = strings.TrimSpace(strings.TrimRight(title, "#"))

	return title, true
}

// trimIndent quita hasta 3 espacios de sangría. Con 4 o más es código
// sangrado, no un encabezado ni un delimitador.
func trimIndent(line string) (string, bool) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 {
		return "", false
	}

	return trimmed, true
}

// packBlocks agrupa los bloques en fragmentos de hasta maxChars caracteres,
// separados por una línea en blanco. Un bloque de código más largo va solo y
// entero; un párrafo más largo se corta por palabras.
func packBlocks(blocks []markdownBlock, maxChars int) []string {
	var chunks []string
	var current strings.Builder
	currentLength := 0

	flush := func() {
		if currentLength > 0 {
			chunks = append(chunks, current.String())
		}

		current.Reset()
		currentLength = 0
	}

	add := func(text string) {
		length := utf8.RuneCountInString(text)
		if currentLength > 0 && currentLength+2+length > maxChars {
			flush()
		}

		if currentLength > 0 {
			current.WriteString("\n\n")
			currentLength += 2
		}

		current.WriteString(text)
		currentLength += length
	}

	for _, block := range blocks {
		length := utf8.RuneCountInString(block.text)

		switch {
		case length <= maxChars:
			add(block.text)
		case block.code:
			flush()
			chunks = append(chunks, block.text)
		default:
			for _, piece := range splitWords(block.text, maxChars) {
				add(piece)
			}
		}
	}

	flush()

	return chunks
}

// splitWords corta un texto en trozos de hasta maxChars caracteres sin
// partir palabras. Una palabra más larga que maxChars se corta por
// caracteres, nunca a mitad de una runa.
func splitWords(text string, maxChars int) []string {
	var pieces []string
	var current []rune

	for _, word := range strings.FieldsFunc(text, unicode.IsSpace) {
		runes := []rune(word)

		for len(runes) > maxChars {
			if len(current) > 0 {
				pieces = append(pieces, string(current))
				current = nil
			}

			pieces = append(pieces, string(runes[:maxChars]))
			runes = runes[maxChars:]
		}

		switch {
		case len(current) == 0:
			current = runes
		case len(current)+1+len(runes) <= maxChars:
			current = append(append(current, ' '), runes...)
		default:
			pieces = append(pieces, string(current))
			current = runes
		}
	}

	if len(current) > 0 {
		pieces = append(pieces, string(current))
	}

	return pieces
}
