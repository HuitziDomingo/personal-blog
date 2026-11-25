package main

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

// sourceReader es lo que la migración lee del origen.
type sourceReader interface {
	RawPosts(ctx context.Context) ([]mongodb.RawPost, error)
}

// targetStore es lo que la migración lee y escribe en el destino.
type targetStore interface {
	targetReader
	UpsertRawPost(ctx context.Context, post mongodb.RawPost) error
}

// migration es una corrida del comando.
type migration struct {
	source   sourceReader
	target   targetStore
	files    uploader
	rewriter *rewriter
	filter   filter
	filesDir string
	dryRun   bool
	out      io.Writer
}

// run arma el plan, lo informa y, fuera del simulacro y sin problemas, lo
// aplica: primero los archivos y después los posts, para que ningún post
// apunte a una portada que todavía no está en el bucket.
func (m migration) run(ctx context.Context) error {
	sources, err := m.source.RawPosts(ctx)
	if err != nil {
		return fmt.Errorf("leer el origen: %w", err)
	}

	p, err := buildPlan(ctx, sources, m.target, m.filter, m.rewriter, m.filesDir)
	if err != nil {
		return err
	}

	r := reporter{out: m.out}
	r.plan(p, m.filter, m.files, m.dryRun)

	if len(p.problems) > 0 {
		return r.done(fmt.Errorf("%d problema(s): no se escribe nada", len(p.problems)))
	}

	if m.dryRun {
		r.line("\nSimulacro: no se escribió nada. Para escribir, DRY_RUN=0.")

		return r.err
	}

	r.line("\nEscribiendo:")

	for _, file := range p.uploads {
		result, err := m.files.Upload(ctx, file)
		if err != nil {
			return r.done(fmt.Errorf("subir %s: %w", file.key, err))
		}

		r.linef("  %s: %s", file.key, result)
	}

	written := 0

	for _, post := range p.posts {
		if post.action != actionCreate && post.action != actionUpdate {
			continue
		}

		if err := m.target.UpsertRawPost(ctx, post.post); err != nil {
			return r.done(fmt.Errorf("escribir %s: %w", post.post.Slug, err))
		}

		written++

		r.linef("  %s: %s", post.post.Slug, post.action)
	}

	r.linef("\nListo: %d archivo(s) revisados y %d post(s) escritos.", len(p.uploads), written)

	return r.err
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

// done devuelve err, o el error de escritura si no hay otro.
func (r *reporter) done(err error) error {
	if err != nil {
		return err
	}

	return r.err
}

func (r *reporter) plan(p plan, f filter, files uploader, dryRun bool) {
	if dryRun {
		r.line("Simulacro (DRY_RUN=1): no se escribe nada.")
	} else {
		r.line("Escritura real (DRY_RUN=0).")
	}

	scope := "estados " + strings.Join(f.statuses, ", ")
	if len(f.slugs) > 0 {
		scope += "; slugs " + strings.Join(f.slugs, ", ")
	}

	r.linef("\nPosts en el origen: %d. Se migran: %d (%s). Excluidos: %d.", p.total, len(p.posts), scope, len(p.excluded))

	for _, post := range p.excluded {
		r.linef("  excluido    %s (%s)", post.Slug, post.Status)
	}

	if len(p.posts) > 0 {
		r.line("\nPosts en el destino:")
	}

	for _, post := range p.posts {
		note := ""
		if post.action == actionTargetNewer {
			note = " (editado en el destino después que en el origen)"
		}

		r.linef("  %-11s %s (%s)%s", post.action, post.post.Slug, post.post.Status, note)
	}

	changes := 0
	for _, post := range p.posts {
		changes += len(post.changes)
	}

	r.linef("\nURLs que se reescriben: %d.", changes)

	for _, post := range p.posts {
		for _, change := range post.changes {
			r.linef("  %s, %s:\n    %s\n    → %s", post.post.Slug, change.field, change.from, change.to)
		}
	}

	r.linef("\nArchivos que se suben: %d.", len(p.uploads))

	for _, file := range p.uploads {
		r.linef("  %s → %s (%s, %d bytes)", file.path, files.Describe(file.key), file.contentType, file.size)
	}

	if len(p.problems) > 0 {
		r.linef("\nProblemas: %d.", len(p.problems))

		for _, problem := range p.problems {
			r.linef("  - %s", problem)
		}
	}
}
