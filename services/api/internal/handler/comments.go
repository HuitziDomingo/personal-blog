package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	postsPathPrefix = "/api/v1/posts/"
	commentsSuffix  = "/comments"

	detailInvalidComment = "invalid comment data"
	detailInvalidParent  = "parent must be an approved top-level comment of the same post"
	// Los dos detalles de la moderación están en el contrato
	// (ModerationUnavailable): el admin los distingue.
	detailModerationDisabled    = "comment moderation is disabled"
	detailModerationUnavailable = "comment moderation is unavailable"
)

// Comments es lo que los handlers necesitan del service de comentarios.
type Comments interface {
	Submit(ctx context.Context, slug string, input service.CommentSubmission) error
	ListApproved(ctx context.Context, slug string, limit, offset int) (service.CommentPage, error)
	List(ctx context.Context, status domain.CommentStatus, limit, offset int) (service.CommentPage, error)
	Approve(ctx context.Context, id string) (*domain.Comment, error)
	Reject(ctx context.Context, id string) (*domain.Comment, error)
	Reply(ctx context.Context, parentID, content string) (*domain.Comment, error)
	Analyze(ctx context.Context, id string) (*domain.Comment, error)
}

// SubmitComment guarda el comentario de un lector en revisión. La respuesta
// es la misma si el campo trampa llegó lleno y el comentario se descartó.
func (s server) SubmitComment(ctx context.Context, request gen.SubmitCommentRequestObject) (gen.SubmitCommentResponseObject, error) {
	body := request.Body

	err := s.comments.Submit(ctx, request.Slug, service.CommentSubmission{
		Name:     body.Name,
		Content:  body.Content,
		ParentID: deref(body.ParentId),
		Trap:     deref(body.Website),
	})
	if err != nil {
		return nil, err
	}

	return gen.SubmitComment202JSONResponse{Status: gen.CommentReceiptStatusPending}, nil
}

// ListPostComments devuelve los comentarios aprobados de un post publicado,
// sin datos de moderación.
func (s server) ListPostComments(ctx context.Context, request gen.ListPostCommentsRequestObject) (gen.ListPostCommentsResponseObject, error) {
	params := request.Params

	page, err := s.comments.ListApproved(ctx, request.Slug, int(deref(params.Limit)), int(deref(params.Offset)))
	if err != nil {
		return nil, err
	}

	items := make([]gen.PublicComment, 0, len(page.Comments))
	for _, comment := range page.Comments {
		items = append(items, gen.PublicComment{
			Id:        comment.ID,
			ParentId:  optional(comment.ParentID),
			Name:      comment.Name,
			Content:   comment.Content,
			ByAuthor:  comment.ByAuthor,
			CreatedAt: comment.CreatedAt,
		})
	}

	return gen.ListPostComments200JSONResponse{
		Items:  items,
		Total:  page.Total,
		Limit:  int32(page.Limit),  //nolint:gosec // El service lo acota a MaxPostLimit.
		Offset: int32(page.Offset), //nolint:gosec // El service lo acota a MaxPostOffset.
	}, nil
}

// ListComments lista los comentarios de todos los posts para moderar.
func (s server) ListComments(ctx context.Context, request gen.ListCommentsRequestObject) (gen.ListCommentsResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	params := request.Params

	page, err := s.comments.List(ctx, domain.CommentStatus(deref(params.Status)), int(deref(params.Limit)), int(deref(params.Offset)))
	if err != nil {
		return nil, err
	}

	items := make([]gen.Comment, 0, len(page.Comments))
	for _, comment := range page.Comments {
		items = append(items, toComment(comment))
	}

	return gen.ListComments200JSONResponse{
		Items:  items,
		Total:  page.Total,
		Limit:  int32(page.Limit),  //nolint:gosec // El service lo acota a MaxPostLimit.
		Offset: int32(page.Offset), //nolint:gosec // El service lo acota a MaxPostOffset.
	}, nil
}

// ApproveComment publica un comentario.
func (s server) ApproveComment(ctx context.Context, request gen.ApproveCommentRequestObject) (gen.ApproveCommentResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	comment, err := s.comments.Approve(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.ApproveComment200JSONResponse(toComment(comment)), nil
}

// RejectComment oculta un comentario.
func (s server) RejectComment(ctx context.Context, request gen.RejectCommentRequestObject) (gen.RejectCommentResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	comment, err := s.comments.Reject(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.RejectComment200JSONResponse(toComment(comment)), nil
}

// ReplyToComment publica una respuesta del autor.
func (s server) ReplyToComment(ctx context.Context, request gen.ReplyToCommentRequestObject) (gen.ReplyToCommentResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	reply, err := s.comments.Reply(ctx, request.Id, request.Body.Content)
	if err != nil {
		return nil, err
	}

	return gen.ReplyToComment201JSONResponse(toComment(reply)), nil
}

func toComment(comment *domain.Comment) gen.Comment {
	result := gen.Comment{
		Id:         comment.ID,
		PostId:     comment.PostID,
		PostTitle:  optional(comment.PostTitle),
		PostSlug:   optional(comment.PostSlug),
		ParentId:   optional(comment.ParentID),
		Name:       comment.Name,
		Content:    comment.Content,
		Status:     gen.CommentStatus(comment.Status),
		ByAuthor:   comment.ByAuthor,
		CreatedAt:  comment.CreatedAt,
		ReviewedAt: comment.ReviewedAt,
	}

	if m := comment.Moderation; m != nil {
		result.Moderation = &gen.Moderation{
			Verdict:    gen.ModerationVerdict(m.Verdict),
			Category:   gen.ModerationCategory(m.Category),
			Reason:     m.Reason,
			Model:      m.Model,
			AnalyzedAt: m.AnalyzedAt,
		}
	}

	return result
}

// isCommentSubmission reconoce el envío de un comentario,
// POST /api/v1/posts/{slug}/comments, para su límite propio por IP.
func isCommentSubmission(method, path string) bool {
	if method != http.MethodPost {
		return false
	}

	slug, ok := strings.CutSuffix(strings.TrimPrefix(path, postsPathPrefix), commentsSuffix)

	return ok && strings.HasPrefix(path, postsPathPrefix) && slug != "" && !strings.Contains(slug, "/")
}

// AnalyzeComment pide de nuevo la sugerencia del clasificador.
func (s server) AnalyzeComment(ctx context.Context, request gen.AnalyzeCommentRequestObject) (gen.AnalyzeCommentResponseObject, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return nil, err
	}

	comment, err := s.comments.Analyze(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return gen.AnalyzeComment200JSONResponse(toComment(comment)), nil
}
