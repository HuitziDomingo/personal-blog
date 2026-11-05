package service

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// ExcerptLength es la longitud máxima del extracto generado, incluido el "…".
const ExcerptLength = 160

const ellipsis = "…"

// markdownRule reemplaza una construcción de Markdown por su texto plano.
type markdownRule struct {
	pattern     *regexp.Regexp
	replacement string
}

// markdownRules se aplican en orden: primero los bloques que se descartan
// enteros y después la sintaxis que envuelve texto que se conserva.
var markdownRules = []markdownRule{
	{regexp.MustCompile("(?s)```.*?```"), " "},
	{regexp.MustCompile("(?s)~~~.*?~~~"), " "},
	{regexp.MustCompile(`(?s)<!--.*?-->`), " "},
	{regexp.MustCompile(`<[^>]*>`), " "},
	{regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`), " "},
	{regexp.MustCompile(`(?m)^\s{0,3}\[[^\]]+\]:\s*\S+.*$`), " "},
	{regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`), "$1"},
	{regexp.MustCompile(`\[([^\]]+)\]\[[^\]]*\]`), "$1"},
	{regexp.MustCompile("`([^`]*)`"), "$1"},
	{regexp.MustCompile(`(?m)^\s{0,3}#{1,6}\s+`), ""},
	{regexp.MustCompile(`(?m)^\s{0,3}>[\s>]*`), ""},
	{regexp.MustCompile(`(?m)^\s*([-*_]\s*){3,}$`), " "},
	{regexp.MustCompile(`(?m)^\s*([-*+]|\d+[.)])\s+`), ""},
	{regexp.MustCompile(`\*\*(.+?)\*\*`), "$1"},
	{regexp.MustCompile(`__(.+?)__`), "$1"},
	{regexp.MustCompile(`\*(.+?)\*`), "$1"},
	{regexp.MustCompile(`(^|\W)_(.+?)_(\W|$)`), "$1$2$3"},
	{regexp.MustCompile(`~~(.+?)~~`), "$1"},
}

// GenerateExcerpt devuelve los primeros caracteres del contenido sin sintaxis
// Markdown, con como mucho ExcerptLength caracteres y sin cortar palabras.
// Si recorta, termina en "…".
func GenerateExcerpt(content string) string {
	return truncateWords(stripMarkdown(content), ExcerptLength)
}

// spaceBeforePunctuation aparece al quitar una etiqueta pegada a un signo,
// como en "<b>más</b>.".
var spaceBeforePunctuation = regexp.MustCompile(` ([.,;:!?)])`)

func stripMarkdown(content string) string {
	text := content
	for _, rule := range markdownRules {
		text = rule.pattern.ReplaceAllString(text, rule.replacement)
	}

	return spaceBeforePunctuation.ReplaceAllString(strings.Join(strings.Fields(text), " "), "$1")
}

// truncateWords cuenta caracteres (runas), no bytes, para no partir una letra
// con acento. Corta en el último espacio que cabe; si la primera palabra ya
// no cabe, la corta.
func truncateWords(text string, maxLength int) string {
	if utf8.RuneCountInString(text) <= maxLength {
		return text
	}

	limit := maxLength - utf8.RuneCountInString(ellipsis)
	runes := []rune(text)

	cut := string(runes[:limit])
	if runes[limit] != ' ' {
		if index := strings.LastIndexByte(cut, ' '); index > 0 {
			cut = cut[:index]
		}
	}

	return strings.TrimRight(cut, " ,;:.-") + ellipsis
}
