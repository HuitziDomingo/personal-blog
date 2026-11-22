package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

func TestValidateNeedsEverythingExplicitly(t *testing.T) {
	ok := options{mongoURI: "mongodb://localhost:27017", database: "blog", siteURL: "https://huitzi.xyz/"}

	site, err := validate(ok)
	require.NoError(t, err)
	assert.Equal(t, "https://huitzi.xyz", site)

	for name, change := range map[string]func(*options){
		"sin uri":         func(o *options) { o.mongoURI = "" },
		"sin base":        func(o *options) { o.database = "" },
		"sin web":         func(o *options) { o.siteURL = "" },
		"web sin esquema": func(o *options) { o.siteURL = "huitzi.xyz" },
		"web con ruta":    func(o *options) { o.siteURL = "https://huitzi.xyz/blog" },
		"javascript":      func(o *options) { o.siteURL = "javascript:alert(1)" },
		"con usuario":     func(o *options) { o.siteURL = "https://user@huitzi.xyz" },
	} {
		t.Run(name, func(t *testing.T) {
			opts := ok
			change(&opts)

			_, err := validate(opts)
			require.Error(t, err)
		})
	}
}

func TestBuildCoversReadsThePublishedImage(t *testing.T) {
	covers, err := buildCovers("https://huitzi.xyz", "../../../../apps/web/public")
	require.NoError(t, err)

	require.Len(t, covers, 2)
	cover := covers["arreglos"]
	assert.Equal(t, "https://huitzi.xyz/img/blog/arreglos-portada.webp", cover.URL)
	assert.Equal(t, "Fragmento de código JavaScript con las funciones arrayConcat y arrayPush", cover.Alt)
	assert.False(t, cover.AIGenerated)
	assert.True(t, strings.HasPrefix(cover.BlurDataURL, "data:image/png;base64,"))
	assert.Equal(t, cover, covers["backend-api"], "both posts share the cover, as on the old site")
}

type fakeSetter struct {
	results map[string]mongodb.CoverMigrationResult
	calls   []bool
}

func (f *fakeSetter) SetCoverIfMissing(_ context.Context, slug string, _ domain.Cover, dryRun bool) (mongodb.CoverMigrationResult, error) {
	f.calls = append(f.calls, dryRun)

	return f.results[slug], nil
}

func TestApplyReportsEachPost(t *testing.T) {
	setter := &fakeSetter{results: map[string]mongodb.CoverMigrationResult{"arreglos": mongodb.CoverSet, "backend-api": mongodb.CoverKept}}
	var out bytes.Buffer

	require.NoError(t, apply(t.Context(), setter, map[string]domain.Cover{}, true, &out))

	assert.Equal(t, []bool{true, true}, setter.calls)
	assert.Contains(t, out.String(), "simulacro")
	assert.Contains(t, out.String(), "arreglos     se le asignaría la portada")
	assert.Contains(t, out.String(), "backend-api  tiene otra portada: no se pisa")
}

func TestRunNeverConnectsWithoutAURI(t *testing.T) {
	err := run(t.Context(), options{database: "blog", siteURL: "https://huitzi.xyz"}, &bytes.Buffer{})

	require.ErrorContains(t, err, "falta MIGRATE_MONGO_URI")
}
