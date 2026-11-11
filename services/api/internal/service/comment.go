package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// Límites de un comentario; coinciden con CommentSubmission y AuthorReply en
// el contrato (docs/api/openapi.yaml). El validador del contrato los aplica
// antes; el service los repite sobre el texto ya recortado.
const (
	MaxCommentNameLength    = 50
	MaxCommentContentLength = 2000
)

// AuthorDisplayName es el nombre con el que se guardan las respuestas del
// autor; la web las distingue por ByAuthor.
const AuthorDisplayName = "Autor"

// CommentSubmission es lo que envía un lector. Trap es el campo trampa: una
// persona lo deja vacío.
type CommentSubmission struct {
	Name     string
	Content  string
	ParentID string
	Trap     string
}

// CommentPage es una página de comentarios con el total que cumple el filtro.
type CommentPage struct {
	Comments []*domain.Comment
	Total    int64
	Limit    int
	Offset   int
}

// PublishedPosts es lo que el service de comentarios necesita de los posts:
// encontrar uno publicado por su slug. Lo implementa PostService.
type PublishedPosts interface {
	GetPublished(ctx context.Context, slug string) (*domain.Post, error)
}

// CommentService aplica las reglas de los comentarios (ADR-022): envío anónimo
// con premoderación, lectura pública de los aprobados y la cola del autor.
// Todavía no hay moderación con LLM: los comentarios llegan a la cola sin
// análisis.
type CommentService struct {
	comments domain.CommentRepository
	posts    PublishedPosts
	// enabled es COMMENTS_ENABLED. Con false, el envío responde como si el
	// recurso no existiera.
	enabled bool
	now     func() time.Time
}

// NewCommentService crea el service.
func NewCommentService(comments domain.CommentRepository, posts PublishedPosts, enabled bool, now func() time.Time) *CommentService {
	return &CommentService{comments: comments, posts: posts, enabled: enabled, now: now}
}

// timestamp devuelve la hora con la precisión de MongoDB (milisegundos), como
// PostService.timestamp.
func (s *CommentService) timestamp() time.Time {
	return s.now().UTC().Truncate(time.Millisecond)
}

// Submit guarda el comentario de un lector como pending. Con los comentarios
// desactivados devuelve domain.ErrNotFound. Con el campo trampa lleno no
// guarda nada y devuelve nil: quien lo envió recibe la misma respuesta.
func (s *CommentService) Submit(ctx context.Context, slug string, input CommentSubmission) error {
	if !s.enabled {
		return fmt.Errorf("submit comment: comments are disabled: %w", domain.ErrNotFound)
	}

	if input.Trap != "" {
		return nil
	}

	name, content, err := normalizeComment(input.Name, input.Content)
	if err != nil {
		return fmt.Errorf("submit comment: %w", err)
	}

	post, err := s.posts.GetPublished(ctx, slug)
	if err != nil {
		return fmt.Errorf("submit comment: %w", err)
	}

	if input.ParentID != "" {
		if err := s.checkParent(ctx, input.ParentID, post.ID); err != nil {
			return fmt.Errorf("submit comment: %w", err)
		}
	}

	comment := &domain.Comment{
		PostID:    post.ID,
		ParentID:  input.ParentID,
		Name:      name,
		Content:   content,
		Status:    domain.CommentStatusPending,
		CreatedAt: s.timestamp(),
	}

	if err := s.comments.Create(ctx, comment); err != nil {
		return fmt.Errorf("submit comment: %w", err)
	}

	return nil
}

// ListApproved devuelve los comentarios aprobados de un post publicado.
func (s *CommentService) ListApproved(ctx context.Context, slug string, limit, offset int) (CommentPage, error) {
	post, err := s.posts.GetPublished(ctx, slug)
	if err != nil {
		return CommentPage{}, fmt.Errorf("list approved comments: %w", err)
	}

	return s.list(ctx, domain.CommentFilter{PostID: post.ID, Status: domain.CommentStatusApproved, Limit: limit, Offset: offset})
}

// List devuelve los comentarios de todos los posts para moderar. Un status
// vacío no filtra.
func (s *CommentService) List(ctx context.Context, status domain.CommentStatus, limit, offset int) (CommentPage, error) {
	if status != "" && !status.IsValid() {
		return CommentPage{}, fmt.Errorf("list comments: %w: unknown status %q", domain.ErrInvalidInput, status)
	}

	return s.list(ctx, domain.CommentFilter{Status: status, Limit: limit, Offset: offset})
}

func (s *CommentService) list(ctx context.Context, filter domain.CommentFilter) (CommentPage, error) {
	limit, offset, err := normalizePage(filter.Limit, filter.Offset)
	if err != nil {
		return CommentPage{}, fmt.Errorf("list comments: %w", err)
	}

	filter.Limit, filter.Offset = limit, offset

	comments, total, err := s.comments.List(ctx, filter)
	if err != nil {
		return CommentPage{}, fmt.Errorf("list comments: %w", err)
	}

	return CommentPage{Comments: comments, Total: total, Limit: limit, Offset: offset}, nil
}

// Approve publica el comentario.
func (s *CommentService) Approve(ctx context.Context, id string) (*domain.Comment, error) {
	return s.review(ctx, id, domain.CommentStatusApproved)
}

// Reject oculta el comentario; se borra a los 30 días salvo que se apruebe
// antes.
func (s *CommentService) Reject(ctx context.Context, id string) (*domain.Comment, error) {
	return s.review(ctx, id, domain.CommentStatusRejected)
}

func (s *CommentService) review(ctx context.Context, id string, status domain.CommentStatus) (*domain.Comment, error) {
	reviewedAt := s.timestamp()

	if err := s.comments.UpdateStatus(ctx, id, status, reviewedAt); err != nil {
		return nil, fmt.Errorf("set comment %s: %w", status, err)
	}

	comment, err := s.comments.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("set comment %s: %w", status, err)
	}

	return comment, nil
}

// Reply publica una respuesta del autor a un comentario aprobado que no es
// respuesta de otro.
func (s *CommentService) Reply(ctx context.Context, parentID, content string) (*domain.Comment, error) {
	_, content, err := normalizeComment(AuthorDisplayName, content)
	if err != nil {
		return nil, fmt.Errorf("reply to comment: %w", err)
	}

	// Aquí el comentario es el recurso de la URL: si no existe, es un 404.
	parent, err := s.comments.GetByID(ctx, parentID)
	if err != nil {
		return nil, fmt.Errorf("reply to comment: %w", err)
	}

	if !acceptsReplies(parent, parent.PostID) {
		return nil, fmt.Errorf("reply to comment: %w", domain.ErrInvalidParent)
	}

	now := s.timestamp()
	reply := &domain.Comment{
		PostID:     parent.PostID,
		ParentID:   parent.ID,
		Name:       AuthorDisplayName,
		Content:    content,
		Status:     domain.CommentStatusApproved,
		ByAuthor:   true,
		CreatedAt:  now,
		ReviewedAt: &now,
	}

	if err := s.comments.Create(ctx, reply); err != nil {
		return nil, fmt.Errorf("reply to comment: %w", err)
	}

	return reply, nil
}

// checkParent comprueba que el lector responda a un comentario que acepta
// respuestas. Uno que no existe es domain.ErrInvalidParent, no un 404: el
// recurso de la URL es el post, que sí existe.
func (s *CommentService) checkParent(ctx context.Context, parentID, postID string) error {
	parent, err := s.comments.GetByID(ctx, parentID)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.ErrInvalidParent
	}

	if err != nil {
		return err
	}

	if !acceptsReplies(parent, postID) {
		return domain.ErrInvalidParent
	}

	return nil
}

// acceptsReplies indica si se puede responder al comentario desde ese post:
// está aprobado y no es una respuesta, porque hay un solo nivel.
func acceptsReplies(parent *domain.Comment, postID string) bool {
	return parent.PostID == postID && parent.Status == domain.CommentStatusApproved && parent.ParentID == ""
}

// normalizeComment recorta los espacios de los extremos y comprueba los
// límites en caracteres, no en bytes.
func normalizeComment(name, content string) (string, string, error) {
	name = strings.TrimSpace(name)
	content = strings.TrimSpace(content)

	switch {
	case name == "":
		return "", "", fmt.Errorf("%w: name is required", domain.ErrInvalidComment)
	case content == "":
		return "", "", fmt.Errorf("%w: content is required", domain.ErrInvalidComment)
	case utf8.RuneCountInString(name) > MaxCommentNameLength:
		return "", "", fmt.Errorf("%w: name is longer than %d characters", domain.ErrInvalidComment, MaxCommentNameLength)
	case utf8.RuneCountInString(content) > MaxCommentContentLength:
		return "", "", fmt.Errorf("%w: content is longer than %d characters", domain.ErrInvalidComment, MaxCommentContentLength)
	}

	return name, content, nil
}
