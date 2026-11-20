package service

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitMarkdownSectionsByH2(t *testing.T) {
	content := "Intro del post.\n\n## Primera\n\nTexto uno.\n\n## Segunda ##\n\nTexto dos."

	chunks := SplitMarkdown(content, 800)

	assert.Equal(t, []TextChunk{
		{Section: "", Text: "Intro del post."},
		{Section: "Primera", Text: "Texto uno."},
		{Section: "Segunda", Text: "Texto dos."},
	}, chunks)
}

func TestSplitMarkdownWithoutH2IsOneSection(t *testing.T) {
	content := "# Título\n\nUn párrafo.\n\nOtro párrafo."

	chunks := SplitMarkdown(content, 800)

	assert.Equal(t, []TextChunk{{Section: "", Text: "# Título\n\nUn párrafo.\n\nOtro párrafo."}}, chunks)
}

func TestSplitMarkdownIgnoresH2InsideCodeBlocks(t *testing.T) {
	for name, content := range map[string]string{
		"backticks": "## Uno\n\n```md\n## No es sección\n```\n\nFin.",
		"tildes":    "## Uno\n\n~~~\n## No es sección\n~~~\n\nFin.",
	} {
		t.Run(name, func(t *testing.T) {
			chunks := SplitMarkdown(content, 800)

			require.Len(t, chunks, 1)
			assert.Equal(t, "Uno", chunks[0].Section)
			assert.Contains(t, chunks[0].Text, "## No es sección")
			assert.True(t, strings.HasSuffix(chunks[0].Text, "Fin."))
		})
	}
}

func TestSplitMarkdownFenceClosesOnlyWithSameCharAndLength(t *testing.T) {
	content := "## A\n\n````\n```\n## dentro\n~~~\n````\n\n## B\n\nFuera."

	chunks := SplitMarkdown(content, 800)

	require.Len(t, chunks, 2)
	assert.Equal(t, "A", chunks[0].Section)
	assert.Contains(t, chunks[0].Text, "## dentro")
	assert.Equal(t, TextChunk{Section: "B", Text: "Fuera."}, chunks[1])
}

func TestSplitMarkdownNeverCutsLongCodeBlocks(t *testing.T) {
	code := "```go\n" + strings.Repeat("fmt.Println(\"hola\")\n", 60) + "```"
	content := "## Código\n\nAntes.\n\n" + code + "\n\nDespués."

	chunks := SplitMarkdown(content, 200)

	require.Len(t, chunks, 3)
	assert.Equal(t, "Antes.", chunks[0].Text)
	assert.Equal(t, code, chunks[1].Text)
	assert.Equal(t, "Después.", chunks[2].Text)
	for _, chunk := range chunks {
		assert.Equal(t, "Código", chunk.Section)
	}
}

func TestSplitMarkdownUnclosedFenceRunsToTheEnd(t *testing.T) {
	content := "## A\n\n```\ncódigo\n## B\nmás"

	chunks := SplitMarkdown(content, 800)

	require.Len(t, chunks, 1)
	assert.Equal(t, "```\ncódigo\n## B\nmás", chunks[0].Text)
}

func TestSplitMarkdownSkipsEmptySections(t *testing.T) {
	content := "## Vacía\n\n## También vacía\n   \n\n## Con texto\n\nAlgo."

	chunks := SplitMarkdown(content, 800)

	assert.Equal(t, []TextChunk{{Section: "Con texto", Text: "Algo."}}, chunks)
}

func TestSplitMarkdownEmptyContent(t *testing.T) {
	assert.Empty(t, SplitMarkdown("", 800))
	assert.Empty(t, SplitMarkdown(" \n\n", 800))
}

func TestSplitMarkdownHandlesCRLF(t *testing.T) {
	content := "Intro.\r\n\r\n## Sección\r\n\r\nLínea uno\r\nlínea dos."

	chunks := SplitMarkdown(content, 800)

	assert.Equal(t, []TextChunk{
		{Section: "", Text: "Intro."},
		{Section: "Sección", Text: "Línea uno\nlínea dos."},
	}, chunks)
}

func TestSplitMarkdownKeepsH3InsideTheSection(t *testing.T) {
	content := "## Padre\n\n### Hija\n\nTexto.\n\n#### Nieta\n\nMás."

	chunks := SplitMarkdown(content, 800)

	assert.Equal(t, []TextChunk{{Section: "Padre", Text: "### Hija\n\nTexto.\n\n#### Nieta\n\nMás."}}, chunks)
}

func TestSplitMarkdownTextBeforeTheFirstH2(t *testing.T) {
	content := "Antes de todo.\n\n## Después\n\nTexto."

	chunks := SplitMarkdown(content, 800)

	require.Len(t, chunks, 2)
	assert.Equal(t, TextChunk{Section: "", Text: "Antes de todo."}, chunks[0])
}

func TestSplitMarkdownHashtagWithoutSpaceIsNotAHeading(t *testing.T) {
	content := "##NoEsTítulo\n\n    ## sangrado es código"

	chunks := SplitMarkdown(content, 800)

	require.Len(t, chunks, 1)
	assert.Equal(t, "", chunks[0].Section)
}

func TestSplitMarkdownPacksBlocksUpToTheLimit(t *testing.T) {
	paragraph := strings.Repeat("a", 300)
	content := "## S\n\n" + strings.Join([]string{paragraph, paragraph, paragraph}, "\n\n")

	chunks := SplitMarkdown(content, 700)

	require.Len(t, chunks, 2)
	assert.Equal(t, paragraph+"\n\n"+paragraph, chunks[0].Text)
	assert.Equal(t, paragraph, chunks[1].Text)
}

func TestSplitMarkdownCutsLongParagraphsByWords(t *testing.T) {
	content := strings.TrimSpace(strings.Repeat("palabra ", 300))

	chunks := SplitMarkdown(content, 100)

	require.Greater(t, len(chunks), 1)
	for _, chunk := range chunks {
		assert.LessOrEqual(t, utf8.RuneCountInString(chunk.Text), 100)
		for _, word := range strings.Fields(chunk.Text) {
			assert.Equal(t, "palabra", word)
		}
	}
}

func TestSplitMarkdownCountsCharactersNotBytes(t *testing.T) {
	// 300 runas de 2 bytes: entran en 400 caracteres aunque ocupen 600 bytes.
	paragraph := strings.Repeat("ñ", 300)

	chunks := SplitMarkdown("## Año\n\n"+paragraph, 400)

	require.Len(t, chunks, 1)
	assert.Equal(t, paragraph, chunks[0].Text)
}

func TestSplitMarkdownCutsLongWordsOnRuneBoundaries(t *testing.T) {
	word := strings.Repeat("😀", 250)

	chunks := SplitMarkdown(word, 100)

	require.Len(t, chunks, 3)
	for _, chunk := range chunks {
		assert.True(t, utf8.ValidString(chunk.Text))
	}
	assert.Equal(t, word, chunks[0].Text+chunks[1].Text+chunks[2].Text)
}

func TestSplitMarkdownDefaultLimit(t *testing.T) {
	content := strings.Repeat("x ", 1000)

	for _, chunk := range SplitMarkdown(content, 0) {
		assert.LessOrEqual(t, utf8.RuneCountInString(chunk.Text), DefaultChunkMaxChars)
	}
}
