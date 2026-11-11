package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// fakeCommentRepository guarda los comentarios en memoria.
type fakeCommentRepository struct {
	mu       sync.Mutex
	comments map[string]*domain.Comment
	order    []string
	nextID   int
	err      error
}

func newFakeCommentRepository() *fakeCommentRepository {
	return &fakeCommentRepository{comments: map[string]*domain.Comment{}}
}

func (f *fakeCommentRepository) Create(_ context.Context, comment *domain.Comment) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return f.err
	}

	f.nextID++
	comment.ID = fmt.Sprintf("comment-%d", f.nextID)
	stored := *comment
	f.comments[comment.ID] = &stored
	f.order = append(f.order, comment.ID)

	return nil
}

func (f *fakeCommentRepository) GetByID(_ context.Context, id string) (*domain.Comment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	comment, ok := f.comments[id]
	if !ok {
		return nil, domain.ErrNotFound
	}

	found := *comment

	return &found, nil
}

func (f *fakeCommentRepository) List(_ context.Context, filter domain.CommentFilter) ([]*domain.Comment, int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err != nil {
		return nil, 0, f.err
	}

	var matched []*domain.Comment
	for _, id := range f.order {
		comment := f.comments[id]
		if (filter.PostID == "" || comment.PostID == filter.PostID) && (filter.Status == "" || comment.Status == filter.Status) {
			matched = append(matched, comment)
		}
	}

	total := int64(len(matched))
	start := min(filter.Offset, len(matched))
	end := min(start+filter.Limit, len(matched))

	return matched[start:end], total, nil
}

func (f *fakeCommentRepository) UpdateStatus(_ context.Context, id string, status domain.CommentStatus, reviewedAt time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	comment, ok := f.comments[id]
	if !ok {
		return domain.ErrNotFound
	}

	if comment.Status != status {
		comment.Status = status
		comment.ReviewedAt = &reviewedAt
	}

	return nil
}

// insert guarda un comentario tal cual y devuelve su ID.
func (f *fakeCommentRepository) insert(t *testing.T, comment domain.Comment) string {
	t.Helper()
	require.NoError(t, f.Create(t.Context(), &comment))

	return comment.ID
}

func (f *fakeCommentRepository) all() []*domain.Comment {
	f.mu.Lock()
	defer f.mu.Unlock()

	all := make([]*domain.Comment, 0, len(f.order))
	for _, id := range f.order {
		all = append(all, f.comments[id])
	}

	return all
}

// fakePublishedPosts encuentra solo los posts publicados que tiene.
type fakePublishedPosts map[string]*domain.Post

func (f fakePublishedPosts) GetPublished(_ context.Context, slug string) (*domain.Post, error) {
	post, ok := f[slug]
	if !ok || post.Status != domain.PostStatusPublished {
		return nil, fmt.Errorf("get published post: %w", domain.ErrNotFound)
	}

	return post, nil
}

var commentNow = time.Date(2026, 11, 11, 12, 0, 0, 123456789, time.UTC)

func newTestCommentService(enabled bool) (*CommentService, *fakeCommentRepository) {
	repository := newFakeCommentRepository()
	posts := fakePublishedPosts{
		"publicado": {ID: "post-1", Slug: "publicado", Status: domain.PostStatusPublished},
		"otro":      {ID: "post-2", Slug: "otro", Status: domain.PostStatusPublished},
		"borrador":  {ID: "post-3", Slug: "borrador", Status: domain.PostStatusDraft},
	}

	return NewCommentService(repository, posts, enabled, func() time.Time { return commentNow }), repository
}

func TestSubmitSavesAPendingCommentWithoutAnalysis(t *testing.T) {
	comments, repository := newTestCommentService(true)

	err := comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "  Ana  ", Content: "\n Buen post. \n"})

	require.NoError(t, err)
	require.Len(t, repository.all(), 1)
	saved := repository.all()[0]
	assert.Equal(t, &domain.Comment{
		ID:        saved.ID,
		PostID:    "post-1",
		Name:      "Ana",
		Content:   "Buen post.",
		Status:    domain.CommentStatusPending,
		CreatedAt: commentNow.Truncate(time.Millisecond),
	}, saved)
}

func TestSubmitWithCommentsDisabledIsNotFound(t *testing.T) {
	comments, repository := newTestCommentService(false)

	err := comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "Ana", Content: "Hola"})

	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.Empty(t, repository.all())
}

// El campo trampa lleno descarta el comentario sin error, antes de consultar
// nada: quien lo envió recibe la misma respuesta que un comentario guardado.
func TestSubmitWithTheTrapFieldIsDiscardedSilently(t *testing.T) {
	comments, repository := newTestCommentService(true)
	repository.err = errors.New("the repository must not be called")

	for _, slug := range []string{"publicado", "no-existe"} {
		require.NoError(t, comments.Submit(t.Context(), slug, CommentSubmission{Name: "Bot", Content: "Compra", Trap: "https://spam.example"}))
	}

	assert.Empty(t, repository.all())
}

func TestSubmitOnlyToPublishedPosts(t *testing.T) {
	comments, repository := newTestCommentService(true)

	for _, slug := range []string{"borrador", "no-existe"} {
		err := comments.Submit(t.Context(), slug, CommentSubmission{Name: "Ana", Content: "Hola"})
		require.ErrorIs(t, err, domain.ErrNotFound, slug)
	}

	assert.Empty(t, repository.all())
}

func TestSubmitValidatesNameAndContent(t *testing.T) {
	tests := map[string]CommentSubmission{
		"nombre con solo espacios":    {Name: " \t ", Content: "Hola"},
		"contenido con solo espacios": {Name: "Ana", Content: "\n\n"},
		"nombre de 51 caracteres":     {Name: strings.Repeat("ñ", 51), Content: "Hola"},
		"contenido de 2001":           {Name: "Ana", Content: strings.Repeat("á", 2001)},
	}

	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			comments, repository := newTestCommentService(true)

			require.ErrorIs(t, comments.Submit(t.Context(), "publicado", input), domain.ErrInvalidComment)
			assert.Empty(t, repository.all())
		})
	}

	comments, _ := newTestCommentService(true)
	require.NoError(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: strings.Repeat("ñ", 50), Content: strings.Repeat("á", 2000)}),
		"the limits count characters, not bytes")
}

func TestSubmitReplies(t *testing.T) {
	comments, repository := newTestCommentService(true)
	approved := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Content: "Hola", Status: domain.CommentStatusApproved})
	pending := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Luis", Content: "Hola", Status: domain.CommentStatusPending})
	reply := repository.insert(t, domain.Comment{PostID: "post-1", ParentID: approved, Name: "Eva", Content: "Hola", Status: domain.CommentStatusApproved})
	otherPost := repository.insert(t, domain.Comment{PostID: "post-2", Name: "Ana", Content: "Hola", Status: domain.CommentStatusApproved})

	invalid := map[string]string{
		"padre inexistente":     "comment-999",
		"padre pendiente":       pending,
		"respuesta a respuesta": reply,
		"padre de otro post":    otherPost,
	}
	for name, parentID := range invalid {
		err := comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "Ana", Content: "Hola", ParentID: parentID})
		require.ErrorIs(t, err, domain.ErrInvalidParent, name)
	}

	require.Len(t, repository.all(), 4)

	require.NoError(t, comments.Submit(t.Context(), "publicado", CommentSubmission{Name: "Ana", Content: "Hola", ParentID: approved}))
	saved := repository.all()[4]
	assert.Equal(t, approved, saved.ParentID)
	assert.Equal(t, domain.CommentStatusPending, saved.Status)
}

func TestListApprovedOnlyReturnsApprovedCommentsOfThePost(t *testing.T) {
	comments, repository := newTestCommentService(true)
	first := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Status: domain.CommentStatusApproved})
	repository.insert(t, domain.Comment{PostID: "post-1", Name: "Luis", Status: domain.CommentStatusPending})
	repository.insert(t, domain.Comment{PostID: "post-1", Name: "Eva", Status: domain.CommentStatusRejected})
	repository.insert(t, domain.Comment{PostID: "post-2", Name: "Otro", Status: domain.CommentStatusApproved})

	page, err := comments.ListApproved(t.Context(), "publicado", 0, 0)

	require.NoError(t, err)
	require.Len(t, page.Comments, 1)
	assert.Equal(t, first, page.Comments[0].ID)
	assert.Equal(t, int64(1), page.Total)
	assert.Equal(t, DefaultPostLimit, page.Limit)

	_, err = comments.ListApproved(t.Context(), "borrador", 0, 0)
	require.ErrorIs(t, err, domain.ErrNotFound)

	_, err = comments.ListApproved(t.Context(), "publicado", MaxPostLimit+1, 0)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestListForModeration(t *testing.T) {
	comments, repository := newTestCommentService(true)
	repository.insert(t, domain.Comment{PostID: "post-1", Status: domain.CommentStatusApproved})
	pending := repository.insert(t, domain.Comment{PostID: "post-2", Status: domain.CommentStatusPending})

	page, err := comments.List(t.Context(), domain.CommentStatusPending, 0, 0)
	require.NoError(t, err)
	require.Len(t, page.Comments, 1)
	assert.Equal(t, pending, page.Comments[0].ID)

	page, err = comments.List(t.Context(), "", 0, 0)
	require.NoError(t, err)
	assert.Equal(t, int64(2), page.Total, "an empty status lists every comment")

	_, err = comments.List(t.Context(), "spam", 0, 0)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestApproveAndReject(t *testing.T) {
	comments, repository := newTestCommentService(true)
	id := repository.insert(t, domain.Comment{PostID: "post-1", Status: domain.CommentStatusPending})

	approved, err := comments.Approve(t.Context(), id)
	require.NoError(t, err)
	assert.Equal(t, domain.CommentStatusApproved, approved.Status)
	require.NotNil(t, approved.ReviewedAt)
	assert.Equal(t, commentNow.Truncate(time.Millisecond), *approved.ReviewedAt)

	rejected, err := comments.Reject(t.Context(), id)
	require.NoError(t, err)
	assert.Equal(t, domain.CommentStatusRejected, rejected.Status)

	_, err = comments.Approve(t.Context(), "comment-999")
	require.ErrorIs(t, err, domain.ErrNotFound)

	_, err = comments.Reject(t.Context(), "comment-999")
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestReplyPublishesAnApprovedAuthorComment(t *testing.T) {
	comments, repository := newTestCommentService(true)
	parent := repository.insert(t, domain.Comment{PostID: "post-1", Name: "Ana", Status: domain.CommentStatusApproved})

	reply, err := comments.Reply(t.Context(), parent, "  Gracias, Ana.  ")

	require.NoError(t, err)
	now := commentNow.Truncate(time.Millisecond)
	assert.Equal(t, &domain.Comment{
		ID:         reply.ID,
		PostID:     "post-1",
		ParentID:   parent,
		Name:       AuthorDisplayName,
		Content:    "Gracias, Ana.",
		Status:     domain.CommentStatusApproved,
		ByAuthor:   true,
		CreatedAt:  now,
		ReviewedAt: &now,
	}, reply)
	assert.Len(t, repository.all(), 2)
}

func TestReplyRules(t *testing.T) {
	comments, repository := newTestCommentService(true)
	approved := repository.insert(t, domain.Comment{PostID: "post-1", Status: domain.CommentStatusApproved})
	pending := repository.insert(t, domain.Comment{PostID: "post-1", Status: domain.CommentStatusPending})
	nested := repository.insert(t, domain.Comment{PostID: "post-1", ParentID: approved, Status: domain.CommentStatusApproved})

	_, err := comments.Reply(t.Context(), "comment-999", "Hola")
	require.ErrorIs(t, err, domain.ErrNotFound, "the comment in the URL does not exist")

	for _, id := range []string{pending, nested} {
		_, err := comments.Reply(t.Context(), id, "Hola")
		require.ErrorIs(t, err, domain.ErrInvalidParent)
	}

	_, err = comments.Reply(t.Context(), approved, "   ")
	require.ErrorIs(t, err, domain.ErrInvalidComment)

	assert.Len(t, repository.all(), 3)
}
