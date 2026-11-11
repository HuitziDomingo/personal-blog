package mongodb

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var commentTestTime = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

func newTestCommentRepository(t *testing.T) (*CommentRepository, *Client) {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewCommentRepository(client), client
}

func newComment(postID, name string, status domain.CommentStatus, createdAt time.Time) *domain.Comment {
	return &domain.Comment{
		PostID:    postID,
		Name:      name,
		Content:   "<script>alert(1)</script> `código` tal cual.",
		Status:    status,
		CreatedAt: createdAt,
	}
}

// rawComment lee el documento sin pasar por el repositorio.
func rawComment(t *testing.T, client *Client, id string) bson.M {
	t.Helper()

	objectID, err := bson.ObjectIDFromHex(id)
	require.NoError(t, err)

	var document bson.M
	require.NoError(t, client.database.Collection(commentsCollection).FindOne(t.Context(), bson.D{{Key: "_id", Value: objectID}}).Decode(&document))

	return document
}

func TestCommentRoundTrip(t *testing.T) {
	repository, client := newTestCommentRepository(t)
	reviewedAt := commentTestTime.Add(time.Hour)
	comment := &domain.Comment{
		PostID:   bson.NewObjectID().Hex(),
		ParentID: bson.NewObjectID().Hex(),
		Name:     "Ana",
		Content:  "Hola",
		Status:   domain.CommentStatusApproved,
		ByAuthor: true,
		Moderation: &domain.Moderation{
			Verdict:    domain.ModerationVerdictReview,
			Category:   domain.ModerationCategoryPromptInjection,
			Reason:     "asks to ignore instructions",
			Model:      "gemini-test",
			AnalyzedAt: commentTestTime,
		},
		CreatedAt:  commentTestTime,
		ReviewedAt: &reviewedAt,
	}

	require.NoError(t, repository.Create(t.Context(), comment))
	require.NotEmpty(t, comment.ID)

	found, err := repository.GetByID(t.Context(), comment.ID)
	require.NoError(t, err)
	assert.Equal(t, comment, found)

	// Sin datos del lector (ADR-022, punto 1) y sin rejected_at si no está rechazado.
	keys := make([]string, 0)
	for key := range rawComment(t, client, comment.ID) {
		keys = append(keys, key)
	}
	assert.ElementsMatch(t, []string{"_id", "post_id", "parent_id", "name", "content", "status", "by_author", "moderation", "created_at", "reviewed_at"}, keys)
}

// Un comentario sin respuesta, sin análisis y sin revisar no guarda esos campos.
func TestPendingCommentHasNoOptionalFields(t *testing.T) {
	repository, client := newTestCommentRepository(t)
	comment := newComment(bson.NewObjectID().Hex(), "Ana", domain.CommentStatusPending, commentTestTime)

	require.NoError(t, repository.Create(t.Context(), comment))

	found, err := repository.GetByID(t.Context(), comment.ID)
	require.NoError(t, err)
	assert.Equal(t, comment, found)
	assert.Nil(t, found.Moderation)
	assert.Nil(t, found.ReviewedAt)

	document := rawComment(t, client, comment.ID)
	for _, key := range []string{"parent_id", "moderation", "reviewed_at", "rejected_at"} {
		assert.NotContains(t, document, key)
	}
}

func TestGetCommentNotFound(t *testing.T) {
	repository, _ := newTestCommentRepository(t)

	for _, id := range []string{bson.NewObjectID().Hex(), "no-es-un-id"} {
		_, err := repository.GetByID(t.Context(), id)
		require.ErrorIs(t, err, domain.ErrNotFound, id)
	}
}

func TestListCommentsFiltersAndPaginatesOldestFirst(t *testing.T) {
	repository, _ := newTestCommentRepository(t)
	post, other := bson.NewObjectID().Hex(), bson.NewObjectID().Hex()

	// Se insertan desordenados: el orden sale de created_at, y de _id al empatar.
	for _, comment := range []*domain.Comment{
		newComment(post, "tercero", domain.CommentStatusApproved, commentTestTime.Add(2*time.Minute)),
		newComment(post, "primero", domain.CommentStatusApproved, commentTestTime),
		newComment(post, "pendiente", domain.CommentStatusPending, commentTestTime.Add(time.Minute)),
		newComment(post, "segundo", domain.CommentStatusApproved, commentTestTime.Add(time.Minute)),
		newComment(other, "otro post", domain.CommentStatusApproved, commentTestTime),
	} {
		require.NoError(t, repository.Create(t.Context(), comment))
	}

	names := func(comments []*domain.Comment) []string {
		result := make([]string, 0, len(comments))
		for _, comment := range comments {
			result = append(result, comment.Name)
		}

		return result
	}

	approved, total, err := repository.List(t.Context(), domain.CommentFilter{PostID: post, Status: domain.CommentStatusApproved, Limit: 2})
	require.NoError(t, err)
	assert.Equal(t, []string{"primero", "segundo"}, names(approved))
	assert.Equal(t, int64(3), total)

	next, _, err := repository.List(t.Context(), domain.CommentFilter{PostID: post, Status: domain.CommentStatusApproved, Limit: 2, Offset: 2})
	require.NoError(t, err)
	assert.Equal(t, []string{"tercero"}, names(next))

	pending, total, err := repository.List(t.Context(), domain.CommentFilter{Status: domain.CommentStatusPending, Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, []string{"pendiente"}, names(pending))
	assert.Equal(t, int64(1), total)

	all, total, err := repository.List(t.Context(), domain.CommentFilter{Limit: 10})
	require.NoError(t, err)
	assert.Len(t, all, 5)
	assert.Equal(t, int64(5), total)

	_, _, err = repository.List(t.Context(), domain.CommentFilter{Limit: 0})
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestUpdateCommentStatus(t *testing.T) {
	repository, client := newTestCommentRepository(t)
	comment := newComment(bson.NewObjectID().Hex(), "Ana", domain.CommentStatusPending, commentTestTime)
	require.NoError(t, repository.Create(t.Context(), comment))

	rejectedAt := commentTestTime.Add(time.Hour)
	require.NoError(t, repository.UpdateStatus(t.Context(), comment.ID, domain.CommentStatusRejected, rejectedAt))

	document := rawComment(t, client, comment.ID)
	assert.Equal(t, "rejected", document["status"])
	assert.Equal(t, bson.NewDateTimeFromTime(rejectedAt), document["rejected_at"], "the TTL index deletes it 30 days later")

	// Rechazar de nuevo no cambia nada: los 30 días no se reinician.
	require.NoError(t, repository.UpdateStatus(t.Context(), comment.ID, domain.CommentStatusRejected, rejectedAt.Add(24*time.Hour)))
	document = rawComment(t, client, comment.ID)
	assert.Equal(t, bson.NewDateTimeFromTime(rejectedAt), document["rejected_at"])
	assert.Equal(t, bson.NewDateTimeFromTime(rejectedAt), document["reviewed_at"])

	// Aprobar quita rejected_at: un aprobado nunca se borra.
	approvedAt := rejectedAt.Add(2 * time.Hour)
	require.NoError(t, repository.UpdateStatus(t.Context(), comment.ID, domain.CommentStatusApproved, approvedAt))
	found, err := repository.GetByID(t.Context(), comment.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.CommentStatusApproved, found.Status)
	require.NotNil(t, found.ReviewedAt)
	assert.Equal(t, approvedAt, *found.ReviewedAt)
	assert.NotContains(t, rawComment(t, client, comment.ID), "rejected_at")

	for _, id := range []string{bson.NewObjectID().Hex(), "no-es-un-id"} {
		require.ErrorIs(t, repository.UpdateStatus(t.Context(), id, domain.CommentStatusApproved, approvedAt), domain.ErrNotFound, id)
	}
}

// Los índices se crean de forma idempotente, con el TTL de 30 días sobre
// rejected_at.
func TestCommentIndexes(t *testing.T) {
	_, client := newTestCommentRepository(t)
	require.NoError(t, client.EnsureIndexes(t.Context()), "running it twice changes nothing")

	cursor, err := client.database.Collection(commentsCollection).Indexes().List(t.Context())
	require.NoError(t, err)

	var indexes []bson.M
	require.NoError(t, cursor.All(t.Context(), &indexes))

	byName := make(map[string]bson.M, len(indexes))
	for _, index := range indexes {
		byName[index["name"].(string)] = index
	}

	require.Contains(t, byName, "rejected_at_1")
	assert.EqualValues(t, 30*24*60*60, byName["rejected_at_1"]["expireAfterSeconds"])
	assert.Contains(t, byName, "post_id_1_status_1_created_at_1__id_1")
	assert.Contains(t, byName, "status_1_created_at_1__id_1")
}

func TestSetCommentModeration(t *testing.T) {
	repository, client := newTestCommentRepository(t)
	comment := newComment(bson.NewObjectID().Hex(), "Ana", domain.CommentStatusPending, commentTestTime)
	require.NoError(t, repository.Create(t.Context(), comment))

	first := domain.Moderation{
		Verdict:    domain.ModerationVerdictApprove,
		Category:   domain.ModerationCategoryNone,
		Reason:     "Pregunta sobre el post.",
		Model:      "gemini-test-001",
		AnalyzedAt: commentTestTime.Add(time.Minute),
	}
	require.NoError(t, repository.SetModeration(t.Context(), comment.ID, first))

	second := first
	second.Verdict, second.Category, second.Reason = domain.ModerationVerdictReview, domain.ModerationCategoryPersonalData, "Incluye un teléfono."
	second.AnalyzedAt = commentTestTime.Add(time.Hour)
	require.NoError(t, repository.SetModeration(t.Context(), comment.ID, second))

	got, err := repository.GetByID(t.Context(), comment.ID)
	require.NoError(t, err)
	assert.Equal(t, &second, got.Moderation, "el análisis nuevo reemplaza al anterior")
	assert.Equal(t, domain.CommentStatusPending, got.Status, "guardar el análisis no cambia el estado")

	raw := rawComment(t, client, comment.ID)
	assert.NotContains(t, raw, "post_title", "el título del post no se guarda con el comentario")

	require.ErrorIs(t, repository.SetModeration(t.Context(), bson.NewObjectID().Hex(), first), domain.ErrNotFound)
	require.ErrorIs(t, repository.SetModeration(t.Context(), "no-es-un-id", first), domain.ErrNotFound)
}
