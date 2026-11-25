package mongodb

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func TestRawPostsKeepEveryField(t *testing.T) {
	repository := newTestPostRepository(t)
	first := withCover(newPost("primero"))
	second := newPost("segundo")
	second.CreatedAt = first.CreatedAt.Add(time.Second)
	createPosts(t, repository, first, second)

	_, err := repository.posts.UpdateOne(t.Context(), bson.D{{Key: "slug", Value: "primero"}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "campo_futuro", Value: "se conserva"}}}})
	require.NoError(t, err)

	posts, err := repository.RawPosts(t.Context())
	require.NoError(t, err)

	require.Len(t, posts, 2)
	assert.Equal(t, []string{"primero", "segundo"}, []string{posts[0].Slug, posts[1].Slug})
	assert.Equal(t, first.ID, posts[0].ID.Hex())
	assert.Equal(t, string(domain.PostStatusDraft), posts[0].Status)
	assert.Equal(t, first.UpdatedAt, posts[0].UpdatedAt)
	assert.Contains(t, posts[0].Doc, bson.E{Key: "campo_futuro", Value: "se conserva"})
}

func TestUpsertRawPostCopiesAndReplacesByID(t *testing.T) {
	source := newTestPostRepository(t)
	target := newTestPostRepository(t)
	post := withCover(newPost("copiado"))
	createPosts(t, source, post)

	posts, err := source.RawPosts(t.Context())
	require.NoError(t, err)
	require.Len(t, posts, 1)

	require.NoError(t, target.UpsertRawPost(t.Context(), posts[0]))
	require.NoError(t, target.UpsertRawPost(t.Context(), posts[0]), "running it again is fine")

	got, err := target.GetBySlug(t.Context(), "copiado")
	require.NoError(t, err)
	assert.Equal(t, post, got, "the copy is the same post, with the same _id and dates")

	count, err := target.posts.CountDocuments(t.Context(), bson.D{})
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)

	edited := posts[0]
	edited.Doc = append(bson.D{}, edited.Doc...)

	for i := range edited.Doc {
		if edited.Doc[i].Key == "title" {
			edited.Doc[i].Value = "Título nuevo"
		}
	}

	require.NoError(t, target.UpsertRawPost(t.Context(), edited))

	got, err = target.GetBySlug(t.Context(), "copiado")
	require.NoError(t, err)
	assert.Equal(t, "Título nuevo", got.Title)
}

func TestUpsertRawPostRejectsASlugWithAnotherID(t *testing.T) {
	source := newTestPostRepository(t)
	target := newTestPostRepository(t)
	createPosts(t, source, newPost("repetido"))
	createPosts(t, target, newPost("repetido"))

	posts, err := source.RawPosts(t.Context())
	require.NoError(t, err)

	err = target.UpsertRawPost(t.Context(), posts[0])
	require.ErrorIs(t, err, domain.ErrDuplicateSlug)
}

func TestRawPostsMatching(t *testing.T) {
	repository := newTestPostRepository(t)
	byID := newPost("por-id")
	bySlug := newPost("por-slug")
	createPosts(t, repository, byID, bySlug, newPost("otro"))

	id, err := bson.ObjectIDFromHex(byID.ID)
	require.NoError(t, err)

	posts, err := repository.RawPostsMatching(t.Context(), []bson.ObjectID{id}, []string{"por-slug", "no-existe"})
	require.NoError(t, err)

	slugs := []string{}
	for _, post := range posts {
		slugs = append(slugs, post.Slug)
	}

	assert.ElementsMatch(t, []string{"por-id", "por-slug"}, slugs)

	onlySlugs, err := repository.RawPostsMatching(t.Context(), nil, []string{"otro"})
	require.NoError(t, err)
	assert.Len(t, onlySlugs, 1)

	none, err := repository.RawPostsMatching(t.Context(), nil, nil)
	require.NoError(t, err)
	assert.Empty(t, none)
}
