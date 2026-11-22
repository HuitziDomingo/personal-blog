package mongodb

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func newTestChunkRepository(t *testing.T) (*ChunkRepository, *Client) {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewChunkRepository(client), client
}

func testChunk(postID string, position int, model, hash string) domain.Chunk {
	embedding := make([]float32, domain.EmbeddingDimensions)
	embedding[0] = float32(position) + 0.5

	return domain.Chunk{
		PostID:      postID,
		Slug:        "post-" + postID[len(postID)-4:],
		PostTitle:   "Post",
		Section:     "Sección",
		Position:    position,
		Text:        "Texto con <html> y `código`.",
		Embedding:   embedding,
		Model:       model,
		ContentHash: hash,
	}
}

func TestChunkRoundTrip(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	postID := bson.NewObjectID().Hex()
	chunks := []domain.Chunk{testChunk(postID, 0, "m1", "h1"), testChunk(postID, 1, "m1", "h1")}

	require.NoError(t, repository.ReplacePostChunks(t.Context(), postID, chunks))

	stored, err := repository.ListByModel(t.Context(), "m1")
	require.NoError(t, err)
	assert.Equal(t, chunks, stored)
}

func TestReplacePostChunksReplacesOnlyThatPost(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	first, second := bson.NewObjectID().Hex(), bson.NewObjectID().Hex()

	require.NoError(t, repository.ReplacePostChunks(t.Context(), first, []domain.Chunk{testChunk(first, 0, "m1", "old"), testChunk(first, 1, "m1", "old")}))
	require.NoError(t, repository.ReplacePostChunks(t.Context(), second, []domain.Chunk{testChunk(second, 0, "m1", "s")}))
	require.NoError(t, repository.ReplacePostChunks(t.Context(), first, []domain.Chunk{testChunk(first, 0, "m1", "new")}))

	state, err := repository.IndexState(t.Context(), first)
	require.NoError(t, err)
	assert.Equal(t, domain.PostIndexState{PostID: first, ContentHash: "new", Model: "m1", Chunks: 1}, state)

	state, err = repository.IndexState(t.Context(), second)
	require.NoError(t, err)
	assert.Equal(t, 1, state.Chunks)
}

func TestReplacePostChunksRejectsChunksOfAnotherPost(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	postID := bson.NewObjectID().Hex()

	err := repository.ReplacePostChunks(t.Context(), postID, []domain.Chunk{testChunk(bson.NewObjectID().Hex(), 0, "m1", "h")})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestDeletePostChunks(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	postID := bson.NewObjectID().Hex()
	require.NoError(t, repository.ReplacePostChunks(t.Context(), postID, []domain.Chunk{testChunk(postID, 0, "m1", "h")}))

	require.NoError(t, repository.DeletePostChunks(t.Context(), postID))
	require.NoError(t, repository.DeletePostChunks(t.Context(), postID), "borrar sin fragmentos no es un error")

	_, err := repository.IndexState(t.Context(), postID)
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestListByModelIgnoresOtherModels(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	first, second := bson.NewObjectID().Hex(), bson.NewObjectID().Hex()
	require.NoError(t, repository.ReplacePostChunks(t.Context(), first, []domain.Chunk{testChunk(first, 0, "nuevo", "h")}))
	require.NoError(t, repository.ReplacePostChunks(t.Context(), second, []domain.Chunk{testChunk(second, 0, "viejo", "h")}))

	stored, err := repository.ListByModel(t.Context(), "nuevo")

	require.NoError(t, err)
	require.Len(t, stored, 1)
	assert.Equal(t, first, stored[0].PostID)
}

func TestIndexStates(t *testing.T) {
	repository, _ := newTestChunkRepository(t)
	first, second := bson.NewObjectID().Hex(), bson.NewObjectID().Hex()
	require.NoError(t, repository.ReplacePostChunks(t.Context(), first, []domain.Chunk{testChunk(first, 0, "m1", "a"), testChunk(first, 1, "m1", "a")}))
	require.NoError(t, repository.ReplacePostChunks(t.Context(), second, []domain.Chunk{testChunk(second, 0, "m2", "b")}))

	states, err := repository.IndexStates(t.Context())

	require.NoError(t, err)
	assert.ElementsMatch(t, []domain.PostIndexState{
		{PostID: first, ContentHash: "a", Model: "m1", Chunks: 2},
		{PostID: second, ContentHash: "b", Model: "m2", Chunks: 1},
	}, states)
}

func TestChunkIndexesAreIdempotent(t *testing.T) {
	_, client := newTestChunkRepository(t)

	require.NoError(t, client.EnsureIndexes(t.Context()))
}
