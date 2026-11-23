package config

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Un nombre de variable de entorno en el código: un literal en mayúsculas con
// al menos un guion bajo (más PORT), sin terminar en guion bajo (los prefijos
// como "RATE_LIMIT_" no cuentan; sus nombres salen de rateLimitSpecs).
var envLiteral = regexp.MustCompile(`"([A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9]|PORT)"`)

// docName es un nombre entre comillas invertidas en la primera columna de una
// fila de la tabla.
var docName = regexp.MustCompile("`([A-Z][A-Z0-9_]+)`")

// codeEnvNames son las variables que lee la API: los literales de los archivos
// de config y de cmd/api (sin tests) y los nombres de los rate limits.
func codeEnvNames(t *testing.T) []string {
	t.Helper()

	files, err := filepath.Glob("*.go")
	require.NoError(t, err)
	files = append(files, filepath.Join("..", "..", "cmd", "api", "main.go"))

	names := map[string]bool{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		src, err := os.ReadFile(file) //nolint:gosec // Archivos .go del propio paquete y cmd/api/main.go.
		require.NoError(t, err)
		for _, match := range envLiteral.FindAllStringSubmatch(string(src), -1) {
			names[match[1]] = true
		}
	}
	for _, spec := range rateLimitSpecs {
		names["RATE_LIMIT_"+spec.name+"_PER_MINUTE"] = true
		names["RATE_LIMIT_"+spec.name+"_BURST"] = true
	}

	return slices.Sorted(func(yield func(string) bool) {
		for name := range names {
			if !yield(name) {
				return
			}
		}
	})
}

// docAPINames son los nombres de la primera columna de la tabla «API» de
// docs/deploy/variables.md.
func docAPINames(t *testing.T) []string {
	t.Helper()

	doc, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "docs", "deploy", "variables.md"))
	require.NoError(t, err)

	_, section, ok := strings.Cut(string(doc), "\n## API")
	require.True(t, ok, "falta la sección ## API")
	section, _, _ = strings.Cut(section, "\n## ")

	var names []string
	for line := range strings.SplitSeq(section, "\n") {
		if !strings.HasPrefix(line, "| `") {
			continue
		}
		firstCell := strings.SplitN(line, "|", 3)[1]
		for _, match := range docName.FindAllStringSubmatch(firstCell, -1) {
			names = append(names, match[1])
		}
	}
	slices.Sort(names)

	return slices.Compact(names)
}

// La tabla de la API en docs/deploy/variables.md y el código usan
// exactamente los mismos nombres: ni variables sin documentar ni filas que el
// código ya no lee.
func TestVariablesDocMatchesTheCode(t *testing.T) {
	code := codeEnvNames(t)
	doc := docAPINames(t)

	var undocumented, stale []string
	for _, name := range code {
		if !slices.Contains(doc, name) {
			undocumented = append(undocumented, name)
		}
	}
	for _, name := range doc {
		if !slices.Contains(code, name) {
			stale = append(stale, name)
		}
	}

	assert.Empty(t, undocumented, "variables que lee la API y no están en docs/deploy/variables.md")
	assert.Empty(t, stale, "filas de docs/deploy/variables.md que la API no lee")
	assert.Greater(t, len(code), 40, "el escaneo del código no encontró las variables")
}
