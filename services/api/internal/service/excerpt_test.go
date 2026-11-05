package service

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
)

func TestGenerateExcerptStripsMarkdown(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{name: "plain text", content: "Texto sin formato.", want: "Texto sin formato."},
		{name: "headings", content: "# Título\n\n## Subtítulo\n\nTexto.", want: "Título Subtítulo Texto."},
		{name: "emphasis", content: "Esto es **negrita**, *cursiva*, __también__, _esto_ y ~~tachado~~.", want: "Esto es negrita, cursiva, también, esto y tachado."},
		{name: "snake case is kept", content: "La variable max_retries_count.", want: "La variable max_retries_count."},
		{name: "links keep their text", content: "Lee [la guía](https://huitzi.xyz/guia) y [el ADR][adr].\n\n[adr]: https://huitzi.xyz/adr", want: "Lee la guía y el ADR."},
		{name: "images are removed", content: "Antes ![diagrama](diagrama.png) después.", want: "Antes después."},
		{name: "inline code keeps its text", content: "Usa `go test` siempre.", want: "Usa go test siempre."},
		{name: "code blocks are removed", content: "Antes.\n\n```go\nfunc main() {}\n```\n\nDespués.", want: "Antes. Después."},
		{name: "tilde code blocks are removed", content: "Antes.\n~~~\ncode\n~~~\nDespués.", want: "Antes. Después."},
		{name: "html is removed", content: "Texto <script>alert(1)</script> y <b>más</b>.<!-- nota -->", want: "Texto alert(1) y más."},
		{name: "blockquotes", content: "> Una cita\n> > anidada", want: "Una cita anidada"},
		{name: "lists", content: "- uno\n* dos\n+ tres\n1. cuatro\n2) cinco", want: "uno dos tres cuatro cinco"},
		{name: "horizontal rule", content: "Antes\n\n---\n\nDespués", want: "Antes Después"},
		{name: "only markdown", content: "```\ncode\n```\n![img](a.png)", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, GenerateExcerpt(tt.content))
		})
	}
}

func TestGenerateExcerptTruncatesAtWords(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{
			name:    "exactly at the limit is not cut",
			content: strings.Repeat("a", ExcerptLength),
			want:    strings.Repeat("a", ExcerptLength),
		},
		{
			name: "cuts at the last space that fits",
			// 20 palabras de 9 caracteres más espacio: 199 caracteres.
			content: strings.TrimSpace(strings.Repeat("palabras ", 20)),
			// Caben 159 caracteres antes del "…": la palabra 18 empieza en
			// el 153 y no cabe, así que quedan 17 (152 caracteres).
			want: strings.TrimSpace(strings.Repeat("palabras ", 17)) + "…",
		},
		{
			name:    "a space right after the cut keeps the last word",
			content: strings.Repeat("a", 159) + " resto",
			want:    strings.Repeat("a", 159) + "…",
		},
		{
			name:    "single word longer than the limit is cut",
			content: strings.Repeat("b", 300),
			want:    strings.Repeat("b", 159) + "…",
		},
		{
			name:    "trailing punctuation before the ellipsis is removed",
			content: strings.Repeat("a", 150) + " hola, " + strings.Repeat("c", 20),
			want:    strings.Repeat("a", 150) + " hola…",
		},
		{
			name:    "multibyte characters are counted as one",
			content: strings.TrimSpace(strings.Repeat("canción ", 30)),
			// 20 palabras de 7 letras con sus espacios son 159 runas,
			// aunque ocupan más bytes.
			want: strings.TrimSpace(strings.Repeat("canción ", 20)) + "…",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GenerateExcerpt(tt.content)
			assert.Equal(t, tt.want, got)
			assert.LessOrEqual(t, utf8.RuneCountInString(got), ExcerptLength)
			assert.True(t, utf8.ValidString(got))
		})
	}
}
