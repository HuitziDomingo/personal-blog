package mongodb

import (
	"context"
	"errors"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// CoverMigrationResult es lo que pasó (o pasaría, en simulacro) con la
// portada de un post.
type CoverMigrationResult string

// Resultados de SetCoverIfMissing.
const (
	// CoverSet: el post no tenía portada y se le asignó.
	CoverSet CoverMigrationResult = "set"
	// CoverUnchanged: el post ya tenía exactamente esa portada.
	CoverUnchanged CoverMigrationResult = "unchanged"
	// CoverKept: el post tiene otra portada y no se pisa.
	CoverKept CoverMigrationResult = "kept"
	// CoverPostMissing: no hay post con ese slug.
	CoverPostMissing CoverMigrationResult = "missing"
)

// SetCoverIfMissing asigna la portada al post del slug solo si no tiene una
// (ADR-026, punto 5). Es idempotente: con la misma portada no escribe nada y
// con otra distinta no la pisa. La escritura lleva la condición «sin portada»
// en el filtro, así que dos corridas a la vez no se pisan entre sí. Con
// dryRun no escribe y devuelve lo que haría. No cambia updated_at: es una
// migración de datos, no una edición del autor.
func (r *PostRepository) SetCoverIfMissing(ctx context.Context, slug string, cover domain.Cover, dryRun bool) (CoverMigrationResult, error) {
	post, err := r.GetBySlug(ctx, slug)
	if errors.Is(err, domain.ErrNotFound) {
		return CoverPostMissing, nil
	}

	if err != nil {
		return "", fmt.Errorf("set cover if missing: %w", err)
	}

	switch {
	case post.Cover != nil && *post.Cover == cover:
		return CoverUnchanged, nil
	case post.Cover != nil:
		return CoverKept, nil
	case dryRun:
		return CoverSet, nil
	}

	filter := bson.D{
		{Key: "slug", Value: slug},
		{Key: "$or", Value: bson.A{
			bson.D{{Key: "cover", Value: nil}},
			bson.D{{Key: "cover", Value: bson.D{{Key: "$exists", Value: false}}}},
		}},
	}

	result, err := r.posts.UpdateOne(ctx, filter, bson.D{{Key: "$set", Value: bson.D{{Key: "cover", Value: toCoverDocument(&cover)}}}})
	if err != nil {
		return "", fmt.Errorf("set cover if missing: %w", err)
	}

	if result.MatchedCount == 0 {
		// Otra corrida la asignó entre la lectura y la escritura.
		return r.SetCoverIfMissing(ctx, slug, cover, true)
	}

	return CoverSet, nil
}
