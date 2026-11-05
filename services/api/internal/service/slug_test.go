package service

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSlugify(t *testing.T) {
	tests := []struct {
		name  string
		title string
		want  string
	}{
		{name: "simple", title: "Hola mundo", want: "hola-mundo"},
		{name: "accents", title: "Orquestación de agentes con IA", want: "orquestacion-de-agentes-con-ia"},
		{name: "enye and dieresis", title: "Año de pingüinos", want: "ano-de-pinguinos"},
		{name: "uppercase accents", title: "ÁRBOL ÉPICO", want: "arbol-epico"},
		{name: "other languages", title: "Crème brûlée à São Paulo", want: "creme-brulee-a-sao-paulo"},
		{name: "punctuation", title: "¿Qué es MCP? ¡Una guía!", want: "que-es-mcp-una-guia"},
		{name: "repeated separators", title: "Go  --  y   Mongo", want: "go-y-mongo"},
		{name: "leading and trailing symbols", title: "  ...Go 1.27!!!  ", want: "go-1-27"},
		{name: "emojis between words", title: "🚀 Lanzamiento 🎉 del blog", want: "lanzamiento-del-blog"},
		{name: "only emojis", title: "🚀🎉🔥", want: ""},
		{name: "only symbols", title: "¿¡--!?", want: ""},
		{name: "non latin script", title: "日本語", want: ""},
		{name: "empty", title: "", want: ""},
		{name: "numbers", title: "10 patrones de Go", want: "10-patrones-de-go"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Slugify(tt.title))
		})
	}
}

func TestSlugifyLongTitles(t *testing.T) {
	tests := []struct {
		name  string
		title string
		want  string
	}{
		{
			name:  "cuts at the last hyphen that fits",
			title: strings.Repeat("palabra ", 20),
			// "palabra-" ocupa 8 caracteres: caben 10 palabras en 80.
			want: strings.TrimSuffix(strings.Repeat("palabra-", 10), "-"),
		},
		{
			name:  "hyphen right at the limit",
			title: strings.Repeat("a", 80) + " siguiente",
			want:  strings.Repeat("a", 80),
		},
		{
			name:  "single word longer than the limit",
			title: strings.Repeat("b", 100),
			want:  strings.Repeat("b", 80),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Slugify(tt.title)
			assert.Equal(t, tt.want, got)
			assert.LessOrEqual(t, len(got), MaxSlugLength)
			assert.True(t, validSlug(got))
		})
	}
}

func TestSlugWithSuffix(t *testing.T) {
	long := strings.TrimSuffix(strings.Repeat("palabra-", 10), "-")

	tests := []struct {
		name string
		base string
		n    int
		want string
	}{
		{name: "first candidate is the base", base: "hola-mundo", n: 1, want: "hola-mundo"},
		{name: "second candidate", base: "hola-mundo", n: 2, want: "hola-mundo-2"},
		{name: "two digits", base: "hola-mundo", n: 12, want: "hola-mundo-12"},
		{name: "long base is cut to fit the suffix", base: long, n: 2, want: strings.Repeat("palabra-", 9) + "2"},
		{name: "long single word", base: strings.Repeat("b", 80), n: 3, want: strings.Repeat("b", 78) + "-3"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := slugWithSuffix(tt.base, tt.n)
			assert.Equal(t, tt.want, got)
			assert.True(t, validSlug(got))
		})
	}
}

func TestValidSlug(t *testing.T) {
	tests := []struct {
		slug string
		want bool
	}{
		{slug: "hola-mundo", want: true},
		{slug: "go-1-27", want: true},
		{slug: "a", want: true},
		{slug: strings.Repeat("a", 80), want: true},
		{slug: strings.Repeat("a", 81), want: false},
		{slug: "", want: false},
		{slug: "Hola-mundo", want: false},
		{slug: "hola--mundo", want: false},
		{slug: "-hola", want: false},
		{slug: "hola-", want: false},
		{slug: "hola mundo", want: false},
		{slug: "orquestación", want: false},
		{slug: "hola_mundo", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.slug, func(t *testing.T) {
			assert.Equal(t, tt.want, validSlug(tt.slug))
		})
	}
}
