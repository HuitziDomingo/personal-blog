package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/imaging"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

// coverKeyHashBytes es la parte del sha256 de la imagen que va en la clave,
// como en service.AcceptCover (ADR-026).
const coverKeyHashBytes = 12

// coverLine es la primera línea de cada Markdown: la portada con su alt.
var coverLine = regexp.MustCompile(`^!\[([^\]]+)\]\(/([^)\s]+)\)$`)

// postStore es lo que el importador necesita de los posts.
type postStore interface {
	GetBySlug(ctx context.Context, slug string) (*domain.Post, error)
	Create(ctx context.Context, post *domain.Post) error
	SetCoverIfMissing(ctx context.Context, slug string, cover domain.Cover, dryRun bool) (mongodb.CoverMigrationResult, error)
}

// prepared es un post listo para importar, ya validado.
type prepared struct {
	post      domain.Post
	alt       string
	coverData []byte
	coverHash string
}

// importer importa los posts de la web anterior.
type importer struct {
	posts     postStore
	authorID  string
	postsDir  string
	publicDir string
	filesDir  string
	baseURL   string
	postWrite *openapi3.Schema
	dryRun    bool
	out       io.Writer
}

func (im importer) run(ctx context.Context) error {
	r := reporter{out: im.out}

	if im.dryRun {
		r.line("Simulacro: no se escribe nada. Para escribir, DRY_RUN=0.")
	} else {
		r.line("Escritura real (DRY_RUN=0).")
	}

	// Primero se validan todos: con uno inválido no se escribe ninguno.
	all := make([]prepared, 0, len(oldPosts))

	for _, old := range oldPosts {
		p, err := im.prepare(old)
		if err != nil {
			return r.done(fmt.Errorf("%s: %w", old.slug, err))
		}

		all = append(all, p)
	}

	for _, p := range all {
		if err := im.importOne(ctx, p, &r); err != nil {
			return r.done(fmt.Errorf("%s: %w", p.post.Slug, err))
		}
	}

	return r.err
}

// prepare lee el Markdown y la portada y valida el post con las reglas de la
// API: las del service y el esquema PostWrite del contrato.
func (im importer) prepare(old oldPost) (prepared, error) {
	content, alt, err := im.readContent(old)
	if err != nil {
		return prepared{}, err
	}

	input, err := service.NormalizeImportedPost(service.PostInput{
		Title:   old.title,
		Slug:    old.slug,
		Excerpt: old.excerpt,
		Content: content,
		Tags:    old.tags,
		Status:  domain.PostStatusPublished,
	}, alt)
	if err != nil {
		return prepared{}, fmt.Errorf("reglas de la API: %w", err)
	}

	if err := im.validateContract(input); err != nil {
		return prepared{}, err
	}

	// Ruta fija de oldPosts bajo el public/ que pasa quien corre el comando.
	data, err := os.ReadFile(filepath.Join(im.publicDir, filepath.FromSlash(old.cover))) //nolint:gosec // Ruta fija bajo un directorio local.
	if err != nil {
		return prepared{}, fmt.Errorf("leer la portada: %w", err)
	}

	if len(data) < 12 || !bytes.Equal(data[:4], []byte("RIFF")) || !bytes.Equal(data[8:12], []byte("WEBP")) {
		return prepared{}, fmt.Errorf("la portada %s no es un WebP", old.cover)
	}

	digest := sha256.Sum256(data)
	publishedAt := old.created.UTC()

	return prepared{
		post: domain.Post{
			Title:       input.Title,
			Slug:        input.Slug,
			Excerpt:     input.Excerpt,
			Content:     input.Content,
			Tags:        input.Tags,
			Status:      input.Status,
			PublishedAt: &publishedAt,
			CreatedAt:   publishedAt,
			UpdatedAt:   old.updated.UTC(),
		},
		alt:       alt,
		coverData: data,
		coverHash: hex.EncodeToString(digest[:coverKeyHashBytes]),
	}, nil
}

// readContent quita del Markdown la primera línea, la portada, que la web
// muestra aparte, y devuelve su alt.
func (im importer) readContent(old oldPost) (string, string, error) {
	// Slug fijo de oldPosts bajo el directorio que pasa quien corre el comando.
	data, err := os.ReadFile(filepath.Join(im.postsDir, old.slug+".md")) //nolint:gosec // Ruta fija bajo un directorio local.
	if err != nil {
		return "", "", fmt.Errorf("leer el Markdown: %w", err)
	}

	first, rest, _ := strings.Cut(string(data), "\n")

	match := coverLine.FindStringSubmatch(strings.TrimSpace(first))
	if match == nil || match[2] != old.cover {
		return "", "", fmt.Errorf("el Markdown no empieza con la portada /%s", old.cover)
	}

	return strings.TrimSpace(rest) + "\n", match[1], nil
}

// validateContract valida el post contra el esquema PostWrite de
// docs/api/openapi.yaml, como lo haría la API al recibirlo.
func (im importer) validateContract(input service.PostInput) error {
	body := map[string]any{
		"title":   input.Title,
		"slug":    input.Slug,
		"excerpt": input.Excerpt,
		"content": input.Content,
		"tags":    input.Tags,
		"status":  string(input.Status),
	}

	// VisitJSON espera los tipos de encoding/json ([]any, no []string).
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("codificar para el contrato: %w", err)
	}

	var value any
	if err := json.Unmarshal(encoded, &value); err != nil {
		return fmt.Errorf("decodificar para el contrato: %w", err)
	}

	if err := im.postWrite.VisitJSON(value); err != nil {
		return fmt.Errorf("contrato PostWrite: %w", err)
	}

	return nil
}

func (im importer) importOne(ctx context.Context, p prepared, r *reporter) error {
	// En -06:00, como los commits y como la web muestra las fechas.
	r.linef("\n%s (%s, publicado %s, actualizado %s)", p.post.Slug, p.post.Status,
		p.post.PublishedAt.In(cst).Format(time.DateTime+" -07:00"), p.post.UpdatedAt.In(cst).Format(time.DateTime+" -07:00"))

	existing, err := im.posts.GetBySlug(ctx, p.post.Slug)

	switch {
	case errors.Is(err, domain.ErrNotFound):
		existing = nil
	case err != nil:
		return fmt.Errorf("buscar el post: %w", err)
	}

	if existing != nil {
		if diff := differences(existing, &p.post); len(diff) > 0 {
			r.linef("  post: ya existe con otros %s: no se pisa", strings.Join(diff, ", "))

			return nil
		}

		r.line("  post: ya existe igual: sin cambios")
	}

	id := "<id nuevo>"
	if existing != nil {
		id = existing.ID
	}

	if existing == nil {
		if im.dryRun {
			r.linef("  post: se crearía (autor %s)", im.authorID)
		} else {
			post := p.post
			post.AuthorID = im.authorID

			if err := im.posts.Create(ctx, &post); err != nil {
				return fmt.Errorf("crear el post: %w", err)
			}

			id = post.ID
			r.linef("  post: creado con _id %s (autor %s)", id, im.authorID)
		}
	}

	key := fmt.Sprintf("covers/%s/%s.webp", id, p.coverHash)
	path := filepath.Join(im.filesDir, filepath.FromSlash(key))
	url := strings.TrimRight(im.baseURL, "/") + "/" + key

	r.linef("  portada: %s (image/webp, %d bytes)\n    → %s", path, len(p.coverData), url)

	if existing == nil && im.dryRun {
		r.line("  portada: se asignaría")

		return nil
	}

	written, err := writeFile(path, p.coverData, im.dryRun)
	if err != nil {
		return err
	}

	r.linef("  archivo: %s", written)

	blur, err := imaging.BlurDataURLOf(p.coverData)
	if err != nil {
		return fmt.Errorf("placeholder de la portada: %w", err)
	}

	result, err := im.posts.SetCoverIfMissing(ctx, p.post.Slug, domain.Cover{URL: url, Alt: p.alt, BlurDataURL: blur}, im.dryRun)
	if err != nil {
		return fmt.Errorf("asignar la portada: %w", err)
	}

	r.linef("  portada: %s", describeCover(result, im.dryRun))

	return nil
}

// differences dice qué campos del post existente no coinciden con el de la
// web anterior. La portada y el autor no cuentan.
func differences(existing, want *domain.Post) []string {
	var diff []string

	check := func(name string, equal bool) {
		if !equal {
			diff = append(diff, name)
		}
	}

	check("título", existing.Title == want.Title)
	check("extracto", existing.Excerpt == want.Excerpt)
	check("contenido", existing.Content == want.Content)
	check("tags", slices.Equal(existing.Tags, want.Tags))
	check("estado", existing.Status == want.Status)
	check("fecha de publicación", existing.PublishedAt != nil && existing.PublishedAt.Equal(*want.PublishedAt))
	check("fecha de creación", existing.CreatedAt.Equal(want.CreatedAt))
	check("fecha de actualización", existing.UpdatedAt.Equal(want.UpdatedAt))

	return diff
}

// writeFile guarda la portada en el almacén local si no está. La clave lleva
// el hash: un archivo con la misma clave y otro contenido es un error.
func writeFile(path string, data []byte, dryRun bool) (string, error) {
	// Ruta armada con una clave validada bajo un directorio local.
	current, err := os.ReadFile(path) //nolint:gosec // Clave validada bajo un directorio local.

	switch {
	case err == nil && bytes.Equal(current, data):
		return "ya está en disco", nil
	case err == nil:
		return "", fmt.Errorf("%s ya existe con otro contenido", path)
	case !errors.Is(err, os.ErrNotExist):
		return "", fmt.Errorf("leer %s: %w", path, err)
	case dryRun:
		return "se escribiría", nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return "", fmt.Errorf("crear el directorio de la portada: %w", err)
	}

	if err := os.WriteFile(path, data, 0o600); err != nil { //nolint:gosec // Clave validada bajo un directorio local.
		return "", fmt.Errorf("escribir la portada: %w", err)
	}

	return "escrito", nil
}

func describeCover(result mongodb.CoverMigrationResult, dryRun bool) string {
	switch result {
	case mongodb.CoverSet:
		if dryRun {
			return "se asignaría"
		}

		return "asignada"
	case mongodb.CoverUnchanged:
		return "ya la tenía: sin cambios"
	case mongodb.CoverKept:
		return "tiene otra portada: no se pisa"
	case mongodb.CoverPostMissing:
		return "el post no existe"
	default:
		return string(result)
	}
}

// reporter escribe el informe y guarda el primer error de escritura.
type reporter struct {
	out io.Writer
	err error
}

func (r *reporter) line(text string) {
	if r.err != nil {
		return
	}

	if _, err := fmt.Fprintln(r.out, text); err != nil {
		r.err = fmt.Errorf("write report: %w", err)
	}
}

func (r *reporter) linef(format string, args ...any) {
	r.line(fmt.Sprintf(format, args...))
}

func (r *reporter) done(err error) error {
	if err != nil {
		return err
	}

	return r.err
}
