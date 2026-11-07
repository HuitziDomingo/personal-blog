package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decode(t *testing.T, line []byte) map[string]any {
	t.Helper()

	var entry map[string]any
	require.NoError(t, json.Unmarshal(line, &entry), string(line))

	return entry
}

func TestJSONUsesCloudLoggingFields(t *testing.T) {
	var out bytes.Buffer

	New(&out, JSON).Warn("ALLOWED_ORIGINS is empty", "count", 0)

	entry := decode(t, out.Bytes())
	assert.Equal(t, "WARNING", entry["severity"])
	assert.Equal(t, "ALLOWED_ORIGINS is empty", entry["message"])
	assert.Contains(t, entry, "time")
	assert.NotContains(t, entry, "level")
	assert.NotContains(t, entry, "msg")
	assert.InDelta(t, 0, entry["count"], 0)
}

func TestJSONOnlyRenamesTopLevelFields(t *testing.T) {
	var out bytes.Buffer

	New(&out, JSON).Info("request", slog.Group("httpRequest", slog.String("message", "inner"), slog.String("level", "x")))

	group, ok := decode(t, out.Bytes())["httpRequest"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "inner", group["message"])
	assert.Equal(t, "x", group["level"])
}

func TestSeverityMapsEveryLevel(t *testing.T) {
	assert.Equal(t, "DEBUG", Severity(slog.LevelDebug))
	assert.Equal(t, "INFO", Severity(slog.LevelInfo))
	assert.Equal(t, "WARNING", Severity(slog.LevelWarn))
	assert.Equal(t, "ERROR", Severity(slog.LevelError))
	assert.Equal(t, "ERROR", Severity(slog.LevelError+4))
}

func TestTextIsKeyValue(t *testing.T) {
	var out bytes.Buffer

	New(&out, Text).Info("api listening", "addr", ":8080")

	assert.Contains(t, out.String(), `level=INFO msg="api listening" addr=:8080`)
}
