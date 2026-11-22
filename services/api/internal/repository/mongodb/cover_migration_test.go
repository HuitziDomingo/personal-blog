package mongodb

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var migratedCover = domain.Cover{
	URL:         "http://localhost:3000/img/blog/arreglos-portada.webp",
	Alt:         "Fragmento de código JavaScript con las funciones arrayConcat y arrayPush",
	BlurDataURL: "data:image/png;base64,iVBORw0KGgo=",
}

func TestSetCoverIfMissing(t *testing.T) {
	repository := newTestPostRepository(t)
	post := newPost("arreglos")
	createPosts(t, repository, post)

	result, err := repository.SetCoverIfMissing(t.Context(), "arreglos", migratedCover, true)
	require.NoError(t, err)
	assert.Equal(t, CoverSet, result, "dry run reports what it would do")

	got, err := repository.GetBySlug(t.Context(), "arreglos")
	require.NoError(t, err)
	assert.Nil(t, got.Cover, "dry run writes nothing")

	result, err = repository.SetCoverIfMissing(t.Context(), "arreglos", migratedCover, false)
	require.NoError(t, err)
	assert.Equal(t, CoverSet, result)

	got, err = repository.GetBySlug(t.Context(), "arreglos")
	require.NoError(t, err)
	assert.Equal(t, &migratedCover, got.Cover)
	assert.Equal(t, post.UpdatedAt, got.UpdatedAt, "a data migration does not touch updated_at")

	result, err = repository.SetCoverIfMissing(t.Context(), "arreglos", migratedCover, false)
	require.NoError(t, err)
	assert.Equal(t, CoverUnchanged, result, "running it again changes nothing")
}

func TestSetCoverIfMissingNeverOverwrites(t *testing.T) {
	repository := newTestPostRepository(t)
	post := withCover(newPost("backend-api"))
	createPosts(t, repository, post)

	result, err := repository.SetCoverIfMissing(t.Context(), "backend-api", migratedCover, false)
	require.NoError(t, err)
	assert.Equal(t, CoverKept, result)

	got, err := repository.GetBySlug(t.Context(), "backend-api")
	require.NoError(t, err)
	assert.Equal(t, post.Cover, got.Cover)
}

func TestSetCoverIfMissingWithoutThePost(t *testing.T) {
	repository := newTestPostRepository(t)

	result, err := repository.SetCoverIfMissing(t.Context(), "no-existe", migratedCover, false)

	require.NoError(t, err)
	assert.Equal(t, CoverPostMissing, result)
}
