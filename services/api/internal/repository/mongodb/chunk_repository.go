package mongodb

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const chunksCollection = "post_chunks"

var _ domain.ChunkRepository = (*ChunkRepository)(nil)

// chunkDocument es la forma en que se guarda un fragmento en MongoDB
// (ADR-027, punto 4). post_id es un string, como en los comentarios: el
// fragmento no se lee nunca uniéndolo con el post.
type chunkDocument struct {
	ID          bson.ObjectID `bson:"_id"`
	PostID      string        `bson:"post_id"`
	Slug        string        `bson:"slug"`
	PostTitle   string        `bson:"post_title"`
	Section     string        `bson:"section"`
	Position    int           `bson:"position"`
	Text        string        `bson:"text"`
	Embedding   []float32     `bson:"embedding"`
	Model       string        `bson:"model"`
	ContentHash string        `bson:"content_hash"`
}

func toChunkDocument(chunk domain.Chunk) chunkDocument {
	return chunkDocument{
		ID:          bson.NewObjectID(),
		PostID:      chunk.PostID,
		Slug:        chunk.Slug,
		PostTitle:   chunk.PostTitle,
		Section:     chunk.Section,
		Position:    chunk.Position,
		Text:        chunk.Text,
		Embedding:   chunk.Embedding,
		Model:       chunk.Model,
		ContentHash: chunk.ContentHash,
	}
}

func toDomainChunk(document chunkDocument) domain.Chunk {
	return domain.Chunk{
		PostID:      document.PostID,
		Slug:        document.Slug,
		PostTitle:   document.PostTitle,
		Section:     document.Section,
		Position:    document.Position,
		Text:        document.Text,
		Embedding:   document.Embedding,
		Model:       document.Model,
		ContentHash: document.ContentHash,
	}
}

// ChunkRepository implementa domain.ChunkRepository sobre MongoDB.
type ChunkRepository struct {
	chunks *mongo.Collection
}

// NewChunkRepository crea el repositorio de fragmentos.
func NewChunkRepository(client *Client) *ChunkRepository {
	return &ChunkRepository{chunks: client.database.Collection(chunksCollection)}
}

// ReplacePostChunks borra los fragmentos del post y guarda los nuevos. Sin
// transacciones (CLAUDE.md): entre el borrado y el insert, una búsqueda puede
// no ver el post. Es una ventana de milisegundos en una función de apoyo.
func (r *ChunkRepository) ReplacePostChunks(ctx context.Context, postID string, chunks []domain.Chunk) error {
	if err := r.DeletePostChunks(ctx, postID); err != nil {
		return err
	}

	if len(chunks) == 0 {
		return nil
	}

	documents := make([]chunkDocument, len(chunks))
	for i, chunk := range chunks {
		if chunk.PostID != postID {
			return fmt.Errorf("replace post chunks: %w: chunk belongs to another post", domain.ErrInvalidInput)
		}

		documents[i] = toChunkDocument(chunk)
	}

	if _, err := r.chunks.InsertMany(ctx, documents); err != nil {
		return fmt.Errorf("insert chunks: %w", err)
	}

	return nil
}

// DeletePostChunks borra los fragmentos del post.
func (r *ChunkRepository) DeletePostChunks(ctx context.Context, postID string) error {
	if _, err := r.chunks.DeleteMany(ctx, bson.D{{Key: "post_id", Value: postID}}); err != nil {
		return fmt.Errorf("delete chunks: %w", err)
	}

	return nil
}

// ListByModel devuelve los fragmentos del modelo, ordenados por post y
// posición para que el resultado sea estable.
func (r *ChunkRepository) ListByModel(ctx context.Context, model string) ([]domain.Chunk, error) {
	cursor, err := r.chunks.Find(ctx,
		bson.D{{Key: "model", Value: model}},
		options.Find().SetSort(bson.D{{Key: "post_id", Value: 1}, {Key: "position", Value: 1}}),
	)
	if err != nil {
		return nil, fmt.Errorf("find chunks: %w", err)
	}

	var documents []chunkDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, fmt.Errorf("decode chunks: %w", err)
	}

	chunks := make([]domain.Chunk, len(documents))
	for i, document := range documents {
		chunks[i] = toDomainChunk(document)
	}

	return chunks, nil
}

// indexStateDocument es el resultado de agrupar los fragmentos por post.
type indexStateDocument struct {
	PostID      string `bson:"_id"`
	ContentHash string `bson:"content_hash"`
	Model       string `bson:"model"`
	Chunks      int    `bson:"chunks"`
}

// IndexState devuelve cómo está indexado un post.
func (r *ChunkRepository) IndexState(ctx context.Context, postID string) (domain.PostIndexState, error) {
	states, err := r.indexStates(ctx, bson.D{{Key: "post_id", Value: postID}})
	if err != nil {
		return domain.PostIndexState{}, err
	}

	if len(states) == 0 {
		return domain.PostIndexState{}, domain.ErrNotFound
	}

	return states[0], nil
}

// IndexStates devuelve el estado de cada post con fragmentos.
func (r *ChunkRepository) IndexStates(ctx context.Context) ([]domain.PostIndexState, error) {
	return r.indexStates(ctx, bson.D{})
}

// indexStates agrupa por post sin traer los vectores. Todos los fragmentos de
// un post se guardan juntos con el mismo hash y modelo, así que $first basta.
func (r *ChunkRepository) indexStates(ctx context.Context, match bson.D) ([]domain.PostIndexState, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$post_id"},
			{Key: "content_hash", Value: bson.D{{Key: "$first", Value: "$content_hash"}}},
			{Key: "model", Value: bson.D{{Key: "$first", Value: "$model"}}},
			{Key: "chunks", Value: bson.D{{Key: "$sum", Value: 1}}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
	}

	cursor, err := r.chunks.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("aggregate chunk states: %w", err)
	}

	var documents []indexStateDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, fmt.Errorf("decode chunk states: %w", err)
	}

	states := make([]domain.PostIndexState, len(documents))
	for i, document := range documents {
		states[i] = domain.PostIndexState(document)
	}

	return states, nil
}

// chunkIndexes son los índices de post_chunks: post_id para reemplazar y
// borrar los fragmentos de un post, y model para la búsqueda, que lee solo
// los del modelo actual.
func chunkIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{Keys: bson.D{{Key: "post_id", Value: 1}, {Key: "position", Value: 1}}},
		{Keys: bson.D{{Key: "model", Value: 1}}},
	}
}
