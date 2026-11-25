package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const (
	realPostsDir  = "../../../../docs/web/posts-migrados"
	realPublicDir = "../../../../apps/web/public"
	baseURL       = "http://localhost:8080/media"
)

// fakePosts es el repositorio en memoria, con las reglas de SetCoverIfMissing.
type fakePosts struct {
	posts   map[string]*domain.Post
	created []string
}

func newFakePosts() *fakePosts {
	return &fakePosts{posts: map[string]*domain.Post{}}
}

func (f *fakePosts) GetBySlug(_ context.Context, slug string) (*domain.Post, error) {
	post, ok := f.posts[slug]
	if !ok {
		return nil, domain.ErrNotFound
	}

	copied := *post

	return &copied, nil
}

func (f *fakePosts) Create(_ context.Context, post *domain.Post) error {
	post.ID = bson.NewObjectID().Hex()
	copied := *post
	f.posts[post.Slug] = &copied
	f.created = append(f.created, post.Slug)

	return nil
}

func (f *fakePosts) SetCoverIfMissing(_ context.Context, slug string, cover domain.Cover, dryRun bool) (mongodb.CoverMigrationResult, error) {
	post, ok := f.posts[slug]

	switch {
	case !ok:
		return mongodb.CoverPostMissing, nil
	case post.Cover != nil && *post.Cover == cover:
		return mongodb.CoverUnchanged, nil
	case post.Cover != nil:
		return mongodb.CoverKept, nil
	case !dryRun:
		post.Cover = &cover
	}

	return mongodb.CoverSet, nil
}

func newImporter(t *testing.T, posts postStore, dryRun bool) (importer, *bytes.Buffer, string) {
	t.Helper()

	spec, err := gen.GetSpec()
	require.NoError(t, err)

	out := &bytes.Buffer{}
	files := t.TempDir()

	return importer{
		posts:     posts,
		authorID:  "6aaaaaaaaaaaaaaaaaaaaaaa",
		postsDir:  realPostsDir,
		publicDir: realPublicDir,
		filesDir:  files,
		baseURL:   baseURL,
		postWrite: spec.Components.Schemas["PostWrite"].Value,
		dryRun:    dryRun,
		out:       out,
	}, out, files
}

func filesIn(t *testing.T, dir string) []string {
	t.Helper()

	var found []string

	require.NoError(t, filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			rel, _ := filepath.Rel(dir, path)
			found = append(found, filepath.ToSlash(rel))
		}

		return err
	}))

	return found
}

func TestPrepareTheRealPostsPassTheAPIRules(t *testing.T) {
	im, _, _ := newImporter(t, newFakePosts(), true)

	for _, old := range oldPosts {
		p, err := im.prepare(old)
		require.NoError(t, err, old.slug)

		assert.Equal(t, old.slug, p.post.Slug)
		assert.Equal(t, domain.PostStatusPublished, p.post.Status)
		assert.False(t, strings.HasPrefix(p.post.Content, "!["), "the cover line is not part of the content")
		assert.NotContains(t, p.post.Content, "arreglos-portada.webp")
		assert.Equal(t, old.created.UTC(), *p.post.PublishedAt)
		assert.Equal(t, old.created.UTC(), p.post.CreatedAt)
		assert.Equal(t, old.updated.UTC(), p.post.UpdatedAt)
		assert.Equal(t, "Fragmento de código JavaScript con las funciones arrayConcat y arrayPush", p.alt)
		assert.Len(t, p.coverHash, 24)
	}
}

func TestPrepareKeepsTheWebImagePaths(t *testing.T) {
	im, _, _ := newImporter(t, newFakePosts(), true)

	p, err := im.prepare(oldPosts[1])
	require.NoError(t, err)

	assert.Contains(t, p.post.Content, "](/img/blog/init.webp)")
	assert.Contains(t, p.post.Content, "](/img/blog/srcdir.webp)")
	assert.Contains(t, p.post.Content, "](/img/blog/conf1.webp)")
	assert.Contains(t, p.post.Content, "](/img/blog/tableplus.webp)")
	// El tutorial menciona mongodb://localhost: es texto, no una URL de la API.
	assert.NotContains(t, p.post.Content, "http://localhost")
}

func TestPrepareRejectsWhatTheContractRejects(t *testing.T) {
	im, _, _ := newImporter(t, newFakePosts(), true)
	old := oldPosts[0]
	old.title = strings.Repeat("a", 201)

	_, err := im.prepare(old)

	require.ErrorContains(t, err, "contrato PostWrite")
}

func TestPrepareNeedsTheCoverLine(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "arreglos.md"), []byte("Sin portada.\n"), 0o600))

	im, _, _ := newImporter(t, newFakePosts(), true)
	im.postsDir = dir

	_, err := im.prepare(oldPosts[0])

	require.ErrorContains(t, err, "no empieza con la portada")
}

func TestDryRunWritesNothing(t *testing.T) {
	posts := newFakePosts()
	im, out, files := newImporter(t, posts, true)

	require.NoError(t, im.run(t.Context()))

	assert.Empty(t, posts.created)
	assert.Empty(t, filesIn(t, files))
	assert.Contains(t, out.String(), "Simulacro")
	assert.Contains(t, out.String(), "post: se crearía")
	assert.Contains(t, out.String(), "covers/<id nuevo>/")
}

func TestRunImportsOnceAndIsIdempotent(t *testing.T) {
	posts := newFakePosts()
	im, out, files := newImporter(t, posts, false)

	require.NoError(t, im.run(t.Context()))

	assert.Equal(t, []string{"arreglos", "backend-api"}, posts.created)

	for _, old := range oldPosts {
		post := posts.posts[old.slug]
		require.NotNil(t, post.Cover, old.slug)
		assert.True(t, strings.HasPrefix(post.Cover.URL, baseURL+"/covers/"+post.ID+"/"), post.Cover.URL)
		assert.True(t, strings.HasPrefix(post.Cover.BlurDataURL, "data:image/png;base64,"))
		assert.False(t, post.Cover.AIGenerated)
		assert.Equal(t, "6aaaaaaaaaaaaaaaaaaaaaaa", post.AuthorID)
	}

	assert.Len(t, filesIn(t, files), 2, "one cover per post: the key carries the post id")

	out.Reset()
	require.NoError(t, im.run(t.Context()))

	assert.Len(t, posts.created, 2, "a second run creates nothing")
	assert.Equal(t, 2, strings.Count(out.String(), "post: ya existe igual: sin cambios"))
	assert.Equal(t, 2, strings.Count(out.String(), "portada: ya la tenía: sin cambios"))
	assert.Equal(t, 2, strings.Count(out.String(), "archivo: ya está en disco"))
}

func TestRunNeverOverwritesAnEditedPost(t *testing.T) {
	posts := newFakePosts()
	edited := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	posts.posts["arreglos"] = &domain.Post{ID: bson.NewObjectID().Hex(), Slug: "arreglos", Title: "Editado", Status: domain.PostStatusDraft, UpdatedAt: edited}
	im, out, _ := newImporter(t, posts, false)

	require.NoError(t, im.run(t.Context()))

	assert.Equal(t, "Editado", posts.posts["arreglos"].Title)
	assert.Nil(t, posts.posts["arreglos"].Cover)
	assert.Contains(t, out.String(), "post: ya existe con otros título, extracto, contenido, tags, estado")
	assert.Equal(t, []string{"backend-api"}, posts.created)
}

func TestWriteFileRefusesADifferentFileWithTheSameKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "covers", "a", "b.webp")

	got, err := writeFile(path, []byte("uno"), false)
	require.NoError(t, err)
	assert.Equal(t, "escrito", got)

	_, err = writeFile(path, []byte("dos"), false)
	require.ErrorContains(t, err, "ya existe con otro contenido")
}

// fakeUsers es la colección de usuarios en memoria.
type fakeUsers map[string]*domain.User

func (f fakeUsers) GetByID(_ context.Context, id string) (*domain.User, error) {
	for _, user := range f {
		if user.ID == id {
			return user, nil
		}
	}

	return nil, domain.ErrNotFound
}

func (f fakeUsers) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	if user, ok := f[email]; ok {
		return user, nil
	}

	return nil, domain.ErrNotFound
}

func TestFindAuthor(t *testing.T) {
	users := fakeUsers{
		"admin@example.com": {ID: "admin-id", Role: domain.UserRoleAdmin},
		"otro@example.com":  {ID: "otro-id", Role: "reader"},
	}

	id, err := findAuthor(t.Context(), users, options{authorEmail: "admin@example.com"})
	require.NoError(t, err)
	assert.Equal(t, "admin-id", id)

	id, err = findAuthor(t.Context(), users, options{authorID: "admin-id"})
	require.NoError(t, err)
	assert.Equal(t, "admin-id", id)

	_, err = findAuthor(t.Context(), users, options{authorEmail: "nadie@example.com"})
	require.ErrorContains(t, err, "no existe")

	_, err = findAuthor(t.Context(), users, options{authorEmail: "otro@example.com"})
	require.ErrorContains(t, err, "no es administrador")
}

func TestIsLocalMongo(t *testing.T) {
	for uri, local := range map[string]bool{
		"mongodb://root:pw@127.0.0.1:27017/?authSource=admin": true,
		"mongodb://localhost":                        true,
		"mongodb://[::1]:27017/":                     true,
		"mongodb://127.0.0.1:27017,localhost:27018/": true,
		"mongodb+srv://u:p@cluster0.example.net/":    false,
		"mongodb://db.example.net:27017/":            false,
		"mongodb://127.0.0.1,db.example.net/":        false,
		"mongodb://u:p@evil.example@127.0.0.1/":      true,
		"mongodb://u:p@127.0.0.1@evil.example/":      false,
		"":                                           false,
	} {
		assert.Equal(t, local, isLocalMongo(uri), uri)
	}
}

func TestValidate(t *testing.T) {
	ok := options{mongoURI: "mongodb://127.0.0.1:27017", database: "personal_blog", authorEmail: "a@example.com", filesDir: "tmp/files", baseURL: baseURL}
	require.NoError(t, validate(ok))

	for name, change := range map[string]func(*options){
		"sin uri":     func(o *options) { o.mongoURI = "" },
		"atlas":       func(o *options) { o.mongoURI = "mongodb+srv://u:p@c.example.net/" },
		"sin base":    func(o *options) { o.database = "" },
		"sin autor":   func(o *options) { o.authorEmail = "" },
		"sin almacén": func(o *options) { o.filesDir = "" },
		"base mala":   func(o *options) { o.baseURL = "localhost:8080/media" },
	} {
		t.Run(name, func(t *testing.T) {
			opts := ok
			change(&opts)

			require.Error(t, validate(opts))
		})
	}
}
