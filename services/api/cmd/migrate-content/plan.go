package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

// coverKeyPattern son las claves de portada que genera la API (ADR-026):
// covers/<post>/<hash>.<ext>. Es el mismo patrón que aceptan los almacenes
// local y gcs.
const coverKeyPattern = `covers/[0-9a-f]{24}/[0-9a-f]{24}\.(?:jpg|png|webp)`

// coverContentTypes es el Content-Type de cada extensión de portada.
var coverContentTypes = map[string]string{
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
}

// localURL encuentra URLs que solo funcionan en la máquina de desarrollo.
var localURL = regexp.MustCompile(`(?i)https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::[0-9]+)?[^\s)"'<>\]]*`)

// rewriter cambia las URLs del almacén local por las del bucket.
type rewriter struct {
	sourceBase string
	cover      *regexp.Regexp
	targetBase string
}

func newRewriter(sourceBaseURL, targetBaseURL string) *rewriter {
	base := strings.TrimRight(sourceBaseURL, "/")

	return &rewriter{
		sourceBase: base,
		cover:      regexp.MustCompile(regexp.QuoteMeta(base) + `/(` + coverKeyPattern + `)`),
		targetBase: strings.TrimRight(targetBaseURL, "/"),
	}
}

// urlChange es una URL reescrita en un campo del post.
type urlChange struct {
	field, from, to string
}

// leftover es una URL local que el comando no sabe reescribir.
type leftover struct {
	field, url string
}

// rewritten es un documento con sus URLs reescritas.
type rewritten struct {
	doc       bson.D
	changes   []urlChange
	keys      []string
	leftovers []leftover
}

// rewrite devuelve una copia del documento con las URLs de portada del
// almacén local cambiadas por las del bucket, en cualquier campo: la portada,
// la imagen de Open Graph o el markdown del contenido. No cambia el original.
func (rw *rewriter) rewrite(doc bson.D) rewritten {
	var result rewritten

	copied, ok := rw.walk(doc, "", &result).(bson.D)
	if !ok {
		copied = bson.D{}
	}

	result.doc = copied

	return result
}

func (rw *rewriter) walk(value any, field string, result *rewritten) any {
	switch typed := value.(type) {
	case bson.D:
		if typed == nil {
			return typed
		}

		copied := make(bson.D, 0, len(typed))
		for _, element := range typed {
			copied = append(copied, bson.E{Key: element.Key, Value: rw.walk(element.Value, join(field, element.Key), result)})
		}

		return copied
	case bson.A:
		if typed == nil {
			return typed
		}

		copied := make(bson.A, 0, len(typed))
		for i, element := range typed {
			copied = append(copied, rw.walk(element, fmt.Sprintf("%s[%d]", field, i), result))
		}

		return copied
	case string:
		return rw.rewriteString(typed, field, result)
	default:
		return value
	}
}

func (rw *rewriter) rewriteString(value, field string, result *rewritten) string {
	replaced := rw.cover.ReplaceAllStringFunc(value, func(match string) string {
		key := strings.TrimPrefix(match, rw.sourceBase+"/")
		to := rw.targetBase + "/" + key

		result.changes = append(result.changes, urlChange{field: field, from: match, to: to})
		if !slices.Contains(result.keys, key) {
			result.keys = append(result.keys, key)
		}

		return to
	})

	for _, url := range localURL.FindAllString(replaced, -1) {
		result.leftovers = append(result.leftovers, leftover{field: field, url: url})
	}

	// Una base local que no es localhost (por ejemplo, otra IP de la red).
	if !localURL.MatchString(rw.sourceBase) && strings.Contains(replaced, rw.sourceBase) {
		result.leftovers = append(result.leftovers, leftover{field: field, url: rw.sourceBase + "/…"})
	}

	return replaced
}

func join(parent, key string) string {
	if parent == "" {
		return key
	}

	return parent + "." + key
}

// action es lo que la migración hace con un post en el destino.
type action string

const (
	actionCreate      action = "crear"
	actionUpdate      action = "actualizar"
	actionUnchanged   action = "sin cambios"
	actionTargetNewer action = "no se pisa"
	actionConflict    action = "conflicto"
)

// postPlan es un post del origen, ya reescrito, y lo que se hará con él.
type postPlan struct {
	post    mongodb.RawPost
	action  action
	changes []urlChange
}

// upload es un archivo del almacén local que se sube al bucket.
type upload struct {
	key, path, contentType string
	size                   int64
}

// plan es todo lo que la migración haría. Con problemas no se escribe nada.
type plan struct {
	total    int
	posts    []postPlan
	excluded []mongodb.RawPost
	uploads  []upload
	problems []string
}

// filter elige qué posts del origen se migran.
type filter struct {
	statuses []string
	slugs    []string
}

func (f filter) includes(post mongodb.RawPost) bool {
	if len(f.slugs) > 0 && !slices.Contains(f.slugs, post.Slug) {
		return false
	}

	return slices.Contains(f.statuses, post.Status)
}

// targetReader es lo que el plan necesita leer del destino.
type targetReader interface {
	RawPostsMatching(ctx context.Context, ids []bson.ObjectID, slugs []string) ([]mongodb.RawPost, error)
}

// buildPlan decide qué se migra sin escribir nada: reescribe las URLs, busca
// las portadas en filesDir y compara con el destino por _id y por slug.
func buildPlan(ctx context.Context, sources []mongodb.RawPost, target targetReader, f filter, rw *rewriter, filesDir string) (plan, error) {
	result := plan{total: len(sources)}

	for _, slug := range f.slugs {
		if !slices.ContainsFunc(sources, func(p mongodb.RawPost) bool { return p.Slug == slug }) {
			result.problems = append(result.problems, fmt.Sprintf("%s: no existe en el origen", slug))
		}
	}

	var (
		ids   []bson.ObjectID
		slugs []string
		keys  []string
	)

	for _, source := range sources {
		if !f.includes(source) {
			result.excluded = append(result.excluded, source)

			continue
		}

		out := rw.rewrite(source.Doc)

		for _, l := range out.leftovers {
			result.problems = append(result.problems, fmt.Sprintf("%s: %s tiene una URL local que no se puede reescribir: %s", source.Slug, l.field, l.url))
		}

		for _, key := range out.keys {
			if !slices.Contains(keys, key) {
				keys = append(keys, key)
			}
		}

		migrated := source
		migrated.Doc = out.doc
		result.posts = append(result.posts, postPlan{post: migrated, changes: out.changes})
		ids = append(ids, source.ID)
		slugs = append(slugs, source.Slug)
	}

	for _, key := range keys {
		file, problem := checkFile(filesDir, key)
		if problem != "" {
			result.problems = append(result.problems, problem)

			continue
		}

		result.uploads = append(result.uploads, file)
	}

	existing, err := target.RawPostsMatching(ctx, ids, slugs)
	if err != nil {
		return plan{}, fmt.Errorf("leer el destino: %w", err)
	}

	byID := make(map[bson.ObjectID]mongodb.RawPost, len(existing))
	bySlug := make(map[string]mongodb.RawPost, len(existing))

	for _, post := range existing {
		byID[post.ID] = post
		bySlug[post.Slug] = post
	}

	for i := range result.posts {
		p := &result.posts[i]

		if other, ok := bySlug[p.post.Slug]; ok && other.ID != p.post.ID {
			result.problems = append(result.problems, fmt.Sprintf(
				"%s: el destino ya tiene un post con ese slug y otro _id (%s, en origen %s); no se sobrescribe",
				p.post.Slug, other.ID.Hex(), p.post.ID.Hex()))
			p.action = actionConflict

			continue
		}

		current, ok := byID[p.post.ID]

		switch {
		case !ok:
			p.action = actionCreate
		case sameDocument(current.Doc, p.post.Doc):
			p.action = actionUnchanged
		case current.UpdatedAt.After(p.post.UpdatedAt):
			p.action = actionTargetNewer
		default:
			p.action = actionUpdate
		}
	}

	return result, nil
}

// checkFile comprueba que la portada exista en disco y que su contenido sea
// del tipo que dice su extensión.
func checkFile(filesDir, key string) (upload, string) {
	contentType, ok := coverContentTypes[filepath.Ext(key)]
	if !ok {
		return upload{}, fmt.Sprintf("%s: extensión sin Content-Type conocido", key)
	}

	path := filepath.Join(filesDir, filepath.FromSlash(key))

	// La clave cumple coverKeyPattern: no sale de filesDir.
	file, err := os.Open(path) //nolint:gosec // Clave validada bajo un directorio local.
	if errors.Is(err, os.ErrNotExist) {
		return upload{}, fmt.Sprintf("%s: la portada falta en disco (%s)", key, path)
	}

	if err != nil {
		return upload{}, fmt.Sprintf("%s: no se pudo abrir: %v", key, err)
	}

	defer func() { _ = file.Close() }()

	info, err := file.Stat()
	if err != nil {
		return upload{}, fmt.Sprintf("%s: no se pudo leer: %v", key, err)
	}

	head := make([]byte, 512)

	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return upload{}, fmt.Sprintf("%s: no se pudo leer: %v", key, err)
	}

	if sniffed := http.DetectContentType(head[:n]); sniffed != contentType {
		return upload{}, fmt.Sprintf("%s: el contenido es %s y la extensión dice %s", key, sniffed, contentType)
	}

	return upload{key: key, path: path, contentType: contentType, size: info.Size()}, ""
}

// sameDocument compara dos documentos por sus bytes en BSON: mismo contenido
// y mismo orden de campos.
func sameDocument(a, b bson.D) bool {
	encodedA, errA := bson.Marshal(a)
	encodedB, errB := bson.Marshal(b)

	return errA == nil && errB == nil && bytes.Equal(encodedA, encodedB)
}
