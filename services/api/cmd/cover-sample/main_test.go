package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDescribeSavesWithTheDetectedExtension(t *testing.T) {
	data, err := os.ReadFile("../../internal/imaging/testdata/cover-lossy.webp")
	require.NoError(t, err)

	report, path, err := describe(data, t.TempDir())

	require.NoError(t, err)
	assert.Equal(t, ".webp", filepath.Ext(path))
	assert.Contains(t, report, "formato:     webp (image/webp)")
	assert.Contains(t, report, "resolución:  1024 × 576")
	assert.Contains(t, report, "metadatos:   ninguno")
	assert.Contains(t, report, "blur:")
}

func TestDescribeKeepsAnUnexpectedOutput(t *testing.T) {
	report, path, err := describe([]byte("<html>no</html>"), t.TempDir())

	require.NoError(t, err)
	assert.Equal(t, ".bin", filepath.Ext(path))
	assert.Contains(t, report, "no aceptado")
}

func TestRunNeedsTheCredentials(t *testing.T) {
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "")

	require.ErrorContains(t, run(t.TempDir()), "faltan CLOUDFLARE_ACCOUNT_ID")
}
