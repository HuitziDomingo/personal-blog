package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const (
	sourceBase = "http://localhost:8080/media"
	targetBase = "https://storage.googleapis.com/huitzi-blog-files-01"
	coverKey   = "covers/6aee15fe21c8164529273e2f/0123456789abcdef01234567.webp"
	inlineKey  = "covers/6aee15fe21c8164529273e2f/89abcdef0123456789abcdef.png"
)

// Cabeceras mínimas que http.DetectContentType reconoce.
var (
	webpBytes = []byte("RIFF\x24\x00\x00\x00WEBPVP8 fake")
	pngBytes  = []byte("\x89PNG\r\n\x1a\nfake")
)

var (
	older = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	newer = time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
)

func rawPost(slug, status string, updatedAt time.Time, content string, cover bson.D) mongodb.RawPost {
	id := bson.NewObjectID()
	doc := bson.D{
		{Key: "_id", Value: id},
		{Key: "slug", Value: slug},
		{Key: "content", Value: content},
		{Key: "status", Value: status},
		{Key: "seo", Value: bson.D{{Key: "og_image_url", Value: ""}, {Key: "keywords", Value: bson.A{"go"}}}},
		{Key: "cover", Value: cover},
		{Key: "updated_at", Value: bson.NewDateTimeFromTime(updatedAt)},
	}

	return mongodb.RawPost{ID: id, Slug: slug, Status: status, UpdatedAt: updatedAt, Doc: doc}
}

func localCover(key string) bson.D {
	return bson.D{
		{Key: "url", Value: sourceBase + "/" + key},
		{Key: "alt", Value: "Un robot."},
		{Key: "blur_data_url", Value: "data:image/png;base64,iVBORw0KGgo="},
	}
}

func filesDir(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	writeFile(t, dir, coverKey, webpBytes)
	writeFile(t, dir, inlineKey, pngBytes)

	return dir
}

func writeFile(t *testing.T, dir, key string, data []byte) {
	t.Helper()

	path := filepath.Join(dir, filepath.FromSlash(key))
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))
	require.NoError(t, os.WriteFile(path, data, 0o600))
}

func field(t *testing.T, doc bson.D, path ...string) any {
	t.Helper()

	var value any = doc

	for _, key := range path {
		current, ok := value.(bson.D)
		require.True(t, ok, "%s is not a document", key)

		value = nil

		for _, element := range current {
			if element.Key == key {
				value = element.Value
			}
		}
	}

	return value
}

func TestRewriteChangesEveryLocalCoverURL(t *testing.T) {
	content := "Texto.\n\n![Diagrama](" + sourceBase + "/" + inlineKey + ")\n\n" +
		"![Otra vez](" + sourceBase + "/" + inlineKey + " \"título\")\n\n![Externa](https://example.com/a.png)"
	post := rawPost("con-portada", "published", older, content, localCover(coverKey))
	original, err := bson.Marshal(post.Doc)
	require.NoError(t, err)

	out := newRewriter(sourceBase+"/", targetBase).rewrite(post.Doc)

	assert.Equal(t, targetBase+"/"+coverKey, field(t, out.doc, "cover", "url"))
	assert.Equal(t, "data:image/png;base64,iVBORw0KGgo=", field(t, out.doc, "cover", "blur_data_url"), "the placeholder is a data URI: nothing to rewrite")
	assert.Equal(t, "Texto.\n\n![Diagrama]("+targetBase+"/"+inlineKey+")\n\n"+
		"![Otra vez]("+targetBase+"/"+inlineKey+" \"título\")\n\n![Externa](https://example.com/a.png)", field(t, out.doc, "content"))
	assert.Equal(t, bson.A{"go"}, field(t, out.doc, "seo", "keywords"))
	assert.Equal(t, []string{inlineKey, coverKey}, out.keys, "each file once")
	assert.Len(t, out.changes, 3)
	assert.Equal(t, urlChange{field: "cover.url", from: sourceBase + "/" + coverKey, to: targetBase + "/" + coverKey}, out.changes[2])
	assert.Empty(t, out.leftovers)

	after, err := bson.Marshal(post.Doc)
	require.NoError(t, err)
	assert.Equal(t, original, after, "the source document is not modified")
}

func TestRewriteReportsLocalURLsItCannotRewrite(t *testing.T) {
	content := "![Vieja](http://localhost:3000/img/blog/arreglos-portada.webp) y [cv](" + sourceBase + "/cv/es/0123456789abcdef01234567.pdf)"
	post := rawPost("rara", "published", older, content, nil)
	post.Doc = append(post.Doc, bson.E{Key: "links", Value: bson.A{"http://127.0.0.1:8080/media/x"}})

	out := newRewriter(sourceBase, targetBase).rewrite(post.Doc)

	assert.Equal(t, []leftover{
		{field: "content", url: "http://localhost:3000/img/blog/arreglos-portada.webp"},
		{field: "content", url: sourceBase + "/cv/es/0123456789abcdef01234567.pdf"},
		{field: "links[0]", url: "http://127.0.0.1:8080/media/x"},
	}, out.leftovers)
	assert.Empty(t, out.keys)
}

// Las imágenes que sirve la web en /img/blog/ (posts de la web anterior,
// BLOG-076) no son del almacén de la API: no se reescriben ni se suben.
func TestRewriteLeavesWebPathsAlone(t *testing.T) {
	content := "![Terminal](/img/blog/init.webp)\n\n![Árbol](/img/blog/srcdir.webp \"src\")"
	post := rawPost("backend-api", "published", older, content, localCover(coverKey))

	out := newRewriter(sourceBase, targetBase).rewrite(post.Doc)

	assert.Equal(t, content, field(t, out.doc, "content"))
	assert.Empty(t, out.leftovers)
	assert.Equal(t, []string{coverKey}, out.keys, "only the cover is uploaded")
	require.Len(t, out.changes, 1)
	assert.Equal(t, "cover.url", out.changes[0].field)
}

func TestRewriteReportsANonLocalhostSourceBase(t *testing.T) {
	post := rawPost("lan", "published", older, "![x](http://192.168.1.5:8080/media/otra.png)", nil)

	out := newRewriter("http://192.168.1.5:8080/media", targetBase).rewrite(post.Doc)

	assert.Equal(t, []leftover{{field: "content", url: "http://192.168.1.5:8080/media/…"}}, out.leftovers)
}

// fakeTarget es el destino en memoria.
type fakeTarget struct {
	posts   []mongodb.RawPost
	written []mongodb.RawPost
	readErr error
}

func (f *fakeTarget) RawPostsMatching(_ context.Context, ids []bson.ObjectID, slugs []string) ([]mongodb.RawPost, error) {
	if f.readErr != nil {
		return nil, f.readErr
	}

	var matching []mongodb.RawPost

	for _, post := range f.posts {
		for _, id := range ids {
			if post.ID == id {
				matching = append(matching, post)
			}
		}

		for _, slug := range slugs {
			if post.Slug == slug {
				matching = append(matching, post)
			}
		}
	}

	return matching, nil
}

func (f *fakeTarget) UpsertRawPost(_ context.Context, post mongodb.RawPost) error {
	f.written = append(f.written, post)

	return nil
}

var allStatuses = filter{statuses: []string{"published", "draft"}}

func TestBuildPlanDecidesWhatHappensToEachPost(t *testing.T) {
	create := rawPost("nuevo", "published", older, "", localCover(coverKey))
	update := rawPost("cambiado", "draft", newer, "nuevo texto", nil)
	unchanged := rawPost("igual", "published", older, "", localCover(coverKey))
	keep := rawPost("editado-en-prod", "published", older, "texto local", nil)
	archived := rawPost("prueba-de-bruno", "archived", older, "", nil)

	rw := newRewriter(sourceBase, targetBase)
	updateInTarget := update
	updateInTarget.Doc = rawPost("cambiado", "draft", older, "texto viejo", nil).Doc
	updateInTarget.UpdatedAt = older
	unchangedInTarget := unchanged
	unchangedInTarget.Doc = rw.rewrite(unchanged.Doc).doc
	keepInTarget := keep
	keepInTarget.Doc = rawPost("editado-en-prod", "published", newer, "texto de prod", nil).Doc
	keepInTarget.UpdatedAt = newer

	target := &fakeTarget{posts: []mongodb.RawPost{updateInTarget, unchangedInTarget, keepInTarget}}

	p, err := buildPlan(t.Context(), []mongodb.RawPost{create, update, unchanged, keep, archived}, target, allStatuses, rw, filesDir(t))
	require.NoError(t, err)

	assert.Empty(t, p.problems)
	assert.Equal(t, 5, p.total)
	assert.Equal(t, []mongodb.RawPost{archived}, p.excluded)

	actions := map[string]action{}
	for _, post := range p.posts {
		actions[post.post.Slug] = post.action
	}

	assert.Equal(t, map[string]action{
		"nuevo":           actionCreate,
		"cambiado":        actionUpdate,
		"igual":           actionUnchanged,
		"editado-en-prod": actionTargetNewer,
	}, actions)
	require.Len(t, p.uploads, 1, "two posts with the same cover upload it once")
	assert.Equal(t, coverKey, p.uploads[0].key)
	assert.Equal(t, "image/webp", p.uploads[0].contentType)
	assert.Equal(t, int64(len(webpBytes)), p.uploads[0].size)
	assert.Equal(t, targetBase+"/"+coverKey, field(t, p.posts[0].post.Doc, "cover", "url"))
}

func TestBuildPlanStopsOnASlugWithAnotherID(t *testing.T) {
	local := rawPost("programacion-claude", "published", older, "", nil)
	other := rawPost("programacion-claude", "published", older, "", nil)

	p, err := buildPlan(t.Context(), []mongodb.RawPost{local}, &fakeTarget{posts: []mongodb.RawPost{other}}, allStatuses, newRewriter(sourceBase, targetBase), t.TempDir())
	require.NoError(t, err)

	require.Len(t, p.problems, 1)
	assert.Contains(t, p.problems[0], "programacion-claude: el destino ya tiene un post con ese slug y otro _id ("+other.ID.Hex())
	assert.Equal(t, actionConflict, p.posts[0].action)
}

func TestBuildPlanReportsFileProblems(t *testing.T) {
	missingKey := "covers/6aee15fe21c8164529273e2f/ffffffffffffffffffffffff.jpg"
	dir := filesDir(t)
	// Un PNG guardado como .webp.
	wrongKey := "covers/6aee15fe21c8164529273e2f/eeeeeeeeeeeeeeeeeeeeeeee.webp"
	writeFile(t, dir, wrongKey, pngBytes)

	posts := []mongodb.RawPost{
		rawPost("sin-archivo", "published", older, "", localCover(missingKey)),
		rawPost("tipo-equivocado", "published", older, "", localCover(wrongKey)),
	}

	p, err := buildPlan(t.Context(), posts, &fakeTarget{}, allStatuses, newRewriter(sourceBase, targetBase), dir)
	require.NoError(t, err)

	require.Len(t, p.problems, 2)
	assert.Contains(t, p.problems[0], missingKey+": la portada falta en disco")
	assert.Equal(t, wrongKey+": el contenido es image/png y la extensión dice image/webp", p.problems[1])
	assert.Empty(t, p.uploads)
}

func TestBuildPlanFiltersBySlug(t *testing.T) {
	posts := []mongodb.RawPost{
		rawPost("programacion-claude", "published", older, "", nil),
		rawPost("prueba-isr", "published", older, "", nil),
	}

	f := filter{statuses: []string{"published"}, slugs: []string{"programacion-claude", "no-existe"}}

	p, err := buildPlan(t.Context(), posts, &fakeTarget{}, f, newRewriter(sourceBase, targetBase), t.TempDir())
	require.NoError(t, err)

	require.Len(t, p.posts, 1)
	assert.Equal(t, "programacion-claude", p.posts[0].post.Slug)
	assert.Equal(t, []string{"no-existe: no existe en el origen"}, p.problems)
}

func TestBuildPlanWrapsTargetErrors(t *testing.T) {
	boom := errors.New("boom")

	_, err := buildPlan(t.Context(), []mongodb.RawPost{rawPost("a", "draft", older, "", nil)}, &fakeTarget{readErr: boom}, allStatuses, newRewriter(sourceBase, targetBase), t.TempDir())

	require.ErrorIs(t, err, boom)
}

// fakeSource es el origen en memoria.
type fakeSource struct {
	posts []mongodb.RawPost
}

func (f fakeSource) RawPosts(context.Context) ([]mongodb.RawPost, error) {
	return f.posts, nil
}

// fakeUploader registra lo que se sube y en qué orden respecto a los posts.
type fakeUploader struct {
	uploaded []string
}

func (f *fakeUploader) Upload(_ context.Context, file upload) (uploadResult, error) {
	f.uploaded = append(f.uploaded, file.key)

	return uploaded, nil
}

func (f *fakeUploader) Describe(key string) string {
	return "gs://huitzi-blog-files-01/" + key
}

func newMigration(t *testing.T, posts []mongodb.RawPost, target *fakeTarget, dryRun bool) (migration, *fakeUploader, *bytes.Buffer) {
	t.Helper()

	files := &fakeUploader{}
	out := &bytes.Buffer{}

	return migration{
		source:   fakeSource{posts: posts},
		target:   target,
		files:    files,
		rewriter: newRewriter(sourceBase, targetBase),
		filter:   allStatuses,
		filesDir: filesDir(t),
		dryRun:   dryRun,
		out:      out,
	}, files, out
}

func TestDryRunWritesNothing(t *testing.T) {
	target := &fakeTarget{}
	m, files, out := newMigration(t, []mongodb.RawPost{rawPost("nuevo", "published", older, "", localCover(coverKey))}, target, true)

	require.NoError(t, m.run(t.Context()))

	assert.Empty(t, target.written)
	assert.Empty(t, files.uploaded)
	assert.Contains(t, out.String(), "Simulacro (DRY_RUN=1)")
	assert.Contains(t, out.String(), "crear       nuevo (published)")
	assert.Contains(t, out.String(), "→ "+targetBase+"/"+coverKey)
	assert.Contains(t, out.String(), "→ gs://huitzi-blog-files-01/"+coverKey+" (image/webp")
}

func TestRunUploadsFilesThenWritesOnlyWhatChanged(t *testing.T) {
	create := rawPost("nuevo", "published", older, "", localCover(coverKey))
	unchanged := rawPost("igual", "published", older, "", nil)
	target := &fakeTarget{posts: []mongodb.RawPost{unchanged}}
	m, files, out := newMigration(t, []mongodb.RawPost{create, unchanged}, target, false)

	require.NoError(t, m.run(t.Context()))

	assert.Equal(t, []string{coverKey}, files.uploaded)
	require.Len(t, target.written, 1)
	assert.Equal(t, create.ID, target.written[0].ID)
	assert.Equal(t, targetBase+"/"+coverKey, field(t, target.written[0].Doc, "cover", "url"))
	assert.Contains(t, out.String(), "Listo: 1 archivo(s) revisados y 1 post(s) escritos.")
}

func TestRunWritesNothingWithProblems(t *testing.T) {
	local := rawPost("repetido", "published", older, "", localCover(coverKey))
	target := &fakeTarget{posts: []mongodb.RawPost{rawPost("repetido", "published", older, "", nil)}}
	m, files, out := newMigration(t, []mongodb.RawPost{local}, target, false)

	err := m.run(t.Context())

	require.EqualError(t, err, "1 problema(s): no se escribe nada")
	assert.Empty(t, target.written)
	assert.Empty(t, files.uploaded)
	assert.Contains(t, out.String(), "Problemas: 1.")
}

func TestDirUploaderIsIdempotent(t *testing.T) {
	dir := filesDir(t)
	file, problem := checkFile(dir, coverKey)
	require.Empty(t, problem)

	destination := t.TempDir()
	u := dirUploader{dir: destination}

	result, err := u.Upload(t.Context(), file)
	require.NoError(t, err)
	assert.Equal(t, uploaded, result)

	result, err = u.Upload(t.Context(), file)
	require.NoError(t, err)
	assert.Equal(t, alreadyThere, result)

	writeFile(t, destination, coverKey, pngBytes)

	_, err = u.Upload(t.Context(), file)
	require.ErrorContains(t, err, "ya existe con otro contenido")
}

func TestValidate(t *testing.T) {
	ok := options{
		sourceURI:     "mongodb://localhost:27017",
		sourceDB:      "personal_blog",
		targetURI:     "mongodb://localhost:27018",
		targetDB:      "personal_blog",
		bucket:        "huitzi-blog-files-01",
		filesDir:      "tmp/files",
		sourceBaseURL: sourceBase,
		statuses:      []string{"published", "draft"},
	}

	require.NoError(t, validate(ok))

	for name, change := range map[string]func(*options){
		"sin origen":         func(o *options) { o.sourceURI = "" },
		"sin destino":        func(o *options) { o.targetURI = "" },
		"sin base de origen": func(o *options) { o.sourceDB = "" },
		"sin base destino":   func(o *options) { o.targetDB = "" },
		"misma base":         func(o *options) { o.targetURI = o.sourceURI },
		"sin bucket":         func(o *options) { o.bucket = "" },
		"bucket con ruta":    func(o *options) { o.bucket = "b/covers" },
		"sin archivos":       func(o *options) { o.filesDir = "" },
		"estado inventado":   func(o *options) { o.statuses = []string{"published", "deleted"} },
		"sin estados":        func(o *options) { o.statuses = nil },
		"base sin esquema":   func(o *options) { o.sourceBaseURL = "localhost:8080/media" },
		"base con usuario":   func(o *options) { o.sourceBaseURL = "http://u@localhost:8080/media" },
	} {
		t.Run(name, func(t *testing.T) {
			opts := ok
			change(&opts)

			require.Error(t, validate(opts))
		})
	}
}

func TestRedactRemovesTheURIs(t *testing.T) {
	// Armada por partes: es un valor de prueba, no una credencial.
	uri := "mongodb+srv://blog-api:" + "s3cret" + "@cluster.example.net/?retryWrites=true"

	got := redact("connect: "+uri+": timeout", "", uri)

	assert.Equal(t, "connect: <uri>: timeout", got)
	assert.False(t, strings.Contains(got, "s3cret"))
}

func TestSplitList(t *testing.T) {
	assert.Equal(t, []string{"a", "b"}, splitList(" a, ,b "))
	assert.Empty(t, splitList(""))
}
