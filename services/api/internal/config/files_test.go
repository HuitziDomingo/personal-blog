package config

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadFilesDefaults(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Files{Store: FilesStoreNone, CVUploadsMax: 10, CVUploadsWindow: time.Hour}, cfg.Files)
}

func TestLoadFilesLocal(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("FILES_STORE", "local")
	t.Setenv("FILES_LOCAL_DIR", "tmp/files")
	t.Setenv("FILES_LOCAL_BASE_URL", "http://localhost:8080/media")
	t.Setenv("RATE_LIMIT_CV_UPLOADS_MAX", "3")
	t.Setenv("RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES", "5")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Files{
		Store:           FilesStoreLocal,
		LocalDir:        "tmp/files",
		LocalBaseURL:    "http://localhost:8080/media",
		CVUploadsMax:    3,
		CVUploadsWindow: 5 * time.Minute,
	}, cfg.Files)
	assert.NotContains(t, strings.Join(cfg.Warnings(), "\n"), "FILES_STORE")
}

func TestLoadFilesGCS(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("GIN_MODE", "release")
	t.Setenv("FILES_STORE", "gcs")
	t.Setenv("FILES_GCS_BUCKET", "huitzi-files")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, Files{
		Store:           FilesStoreGCS,
		GCSBucket:       "huitzi-files",
		CVUploadsMax:    10,
		CVUploadsWindow: time.Hour,
	}, cfg.Files)
	assert.NotContains(t, strings.Join(cfg.Warnings(), "\n"), "FILES_STORE")
}

func TestLoadFilesLocalInReleaseWarns(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("GIN_MODE", "release")
	t.Setenv("FILES_STORE", "local")
	t.Setenv("FILES_LOCAL_DIR", "tmp/files")
	t.Setenv("FILES_LOCAL_BASE_URL", "http://localhost:8080/media")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Contains(t, cfg.Warnings(), "FILES_STORE=local in release mode: the API serves uploaded files from its own origin under /media/; production uses the storage bucket")
}

func TestLoadFilesRejectsBadConfig(t *testing.T) {
	tests := map[string]struct {
		env  map[string]string
		want string
	}{
		"unknown store":      {env: map[string]string{"FILES_STORE": "s3"}, want: `invalid FILES_STORE "s3": must be empty, local or gcs`},
		"gcs without bucket": {env: map[string]string{"FILES_STORE": "gcs"}, want: "FILES_STORE=gcs needs FILES_GCS_BUCKET"},
		"gcs with http url":  {env: map[string]string{"FILES_STORE": "gcs", "FILES_GCS_BUCKET": "files", "FILES_GCS_PUBLIC_URL": "http://storage.example"}, want: `invalid FILES_GCS_PUBLIC_URL "http://storage.example": must be an https url`},
		"local without dir":  {env: map[string]string{"FILES_STORE": "local", "FILES_LOCAL_BASE_URL": "http://localhost:8080/media"}, want: "FILES_STORE=local needs FILES_LOCAL_DIR and FILES_LOCAL_BASE_URL"},
		"local with bad url": {env: map[string]string{"FILES_STORE": "local", "FILES_LOCAL_DIR": "tmp", "FILES_LOCAL_BASE_URL": "javascript:alert(1)"}, want: `invalid FILES_LOCAL_BASE_URL "javascript:alert(1)": must be an http or https url`},
		"zero uploads":       {env: map[string]string{"RATE_LIMIT_CV_UPLOADS_MAX": "0"}},
		"zero upload window": {env: map[string]string{"RATE_LIMIT_CV_UPLOADS_WINDOW_MINUTES": "-1"}},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			setRequiredEnv(t)
			for key, value := range test.env {
				t.Setenv(key, value)
			}

			_, err := Load()

			require.Error(t, err)
			if test.want != "" {
				assert.EqualError(t, err, test.want)
			}
		})
	}
}
