package mongodb

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// RawPost es un documento de la colección posts tal cual está en MongoDB, con
// los campos que la migración de contenido necesita a mano. Doc conserva todos
// los campos, también los que postDocument no conoce, para que copiar un post
// no pierda nada.
type RawPost struct {
	ID        bson.ObjectID
	Slug      string
	Status    string
	UpdatedAt time.Time
	Doc       bson.D
}

// rawPostFields son los campos de RawPost que se leen aparte de Doc.
type rawPostFields struct {
	ID        bson.ObjectID `bson:"_id"`
	Slug      string        `bson:"slug"`
	Status    string        `bson:"status"`
	UpdatedAt time.Time     `bson:"updated_at"`
}

// RawPosts devuelve todos los posts, del más antiguo al más reciente.
func (r *PostRepository) RawPosts(ctx context.Context) ([]RawPost, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}, {Key: "_id", Value: 1}})

	posts, err := r.findRaw(ctx, bson.D{}, opts)
	if err != nil {
		return nil, fmt.Errorf("raw posts: %w", err)
	}

	return posts, nil
}

// RawPostsMatching devuelve los posts que tienen alguno de los ids o alguno de
// los slugs.
func (r *PostRepository) RawPostsMatching(ctx context.Context, ids []bson.ObjectID, slugs []string) ([]RawPost, error) {
	if len(ids) == 0 && len(slugs) == 0 {
		return nil, nil
	}

	// $in no acepta null: un slice nil se manda como lista vacía.
	if ids == nil {
		ids = []bson.ObjectID{}
	}

	if slugs == nil {
		slugs = []string{}
	}

	filter := bson.D{{Key: "$or", Value: bson.A{
		bson.D{{Key: "_id", Value: bson.D{{Key: "$in", Value: ids}}}},
		bson.D{{Key: "slug", Value: bson.D{{Key: "$in", Value: slugs}}}},
	}}}

	posts, err := r.findRaw(ctx, filter, options.Find())
	if err != nil {
		return nil, fmt.Errorf("raw posts matching: %w", err)
	}

	return posts, nil
}

// UpsertRawPost reemplaza el post con el mismo _id, o lo crea si no existe.
// Copia el documento tal cual: no toca updated_at ni ningún otro campo.
func (r *PostRepository) UpsertRawPost(ctx context.Context, post RawPost) error {
	filter := bson.D{{Key: "_id", Value: post.ID}}

	if _, err := r.posts.ReplaceOne(ctx, filter, post.Doc, options.Replace().SetUpsert(true)); err != nil {
		// Un slug repetido solo llega aquí si otro post lo tomó entre la
		// comprobación de la migración y la escritura.
		return fmt.Errorf("upsert raw post %q: %w", post.Slug, translatePostWriteError(err))
	}

	return nil
}

func (r *PostRepository) findRaw(ctx context.Context, filter bson.D, opts *options.FindOptionsBuilder) ([]RawPost, error) {
	cursor, err := r.posts.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("find: %w", err)
	}

	defer func() { _ = cursor.Close(ctx) }()

	var posts []RawPost

	for cursor.Next(ctx) {
		var fields rawPostFields
		if err := cursor.Decode(&fields); err != nil {
			return nil, fmt.Errorf("decode post fields: %w", err)
		}

		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, fmt.Errorf("decode post %q: %w", fields.Slug, err)
		}

		posts = append(posts, RawPost{
			ID:        fields.ID,
			Slug:      fields.Slug,
			Status:    fields.Status,
			UpdatedAt: fields.UpdatedAt.UTC(),
			Doc:       doc,
		})
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("iterate posts: %w", err)
	}

	return posts, nil
}
