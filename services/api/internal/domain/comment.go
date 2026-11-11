package domain

import (
	"context"
	"time"
)

// CommentStatus es el estado de moderación de un comentario (ADR-022).
type CommentStatus string

// Estados de un comentario. Todo comentario de un lector empieza pending.
const (
	CommentStatusPending  CommentStatus = "pending"
	CommentStatusApproved CommentStatus = "approved"
	CommentStatusRejected CommentStatus = "rejected"
)

// IsValid indica si el estado pertenece al enum.
func (s CommentStatus) IsValid() bool {
	switch s {
	case CommentStatusPending, CommentStatusApproved, CommentStatusRejected:
		return true
	default:
		return false
	}
}

// ModerationVerdict es lo que sugiere el clasificador.
type ModerationVerdict string

// Veredictos del clasificador.
const (
	ModerationVerdictApprove ModerationVerdict = "approve"
	ModerationVerdictReject  ModerationVerdict = "reject"
	ModerationVerdictReview  ModerationVerdict = "review"
)

// ModerationCategory es el tipo de problema que detectó el clasificador.
type ModerationCategory string

// Categorías del clasificador.
const (
	ModerationCategoryNone            ModerationCategory = "none"
	ModerationCategorySpam            ModerationCategory = "spam"
	ModerationCategoryAbuse           ModerationCategory = "abuse"
	ModerationCategoryOffTopic        ModerationCategory = "off_topic"
	ModerationCategoryPromptInjection ModerationCategory = "prompt_injection"
	ModerationCategoryPersonalData    ModerationCategory = "personal_data"
)

// Moderation es el análisis del clasificador de un comentario. Solo orienta:
// el autor decide (ADR-022, punto 5).
type Moderation struct {
	Verdict    ModerationVerdict
	Category   ModerationCategory
	Reason     string
	Model      string
	AnalyzedAt time.Time
}

// Comment es un comentario en un post. No guarda IP, correo, user agent ni
// ningún otro identificador de quien lo escribió (ADR-022, punto 1).
type Comment struct {
	ID     string
	PostID string
	// ParentID es el comentario al que responde; vacío si no es una respuesta.
	// Hay un solo nivel de respuestas.
	ParentID string
	Name     string
	Content  string
	Status   CommentStatus
	// ByAuthor marca las respuestas del autor del blog.
	ByAuthor bool
	// Moderation es nil mientras no haya análisis.
	Moderation *Moderation
	CreatedAt  time.Time
	// ReviewedAt es cuándo el autor lo aprobó o rechazó por última vez; nil
	// mientras siga pendiente.
	ReviewedAt *time.Time
}

// CommentFilter acota un listado de comentarios. PostID y Status en su valor
// cero no filtran. El orden es siempre del más antiguo al más reciente.
type CommentFilter struct {
	PostID string
	Status CommentStatus
	Limit  int
	Offset int
}

// CommentRepository es el puerto de persistencia de comentarios.
type CommentRepository interface {
	// Create guarda el comentario y le asigna un ID.
	Create(ctx context.Context, comment *Comment) error
	// GetByID devuelve ErrNotFound si el comentario no existe.
	GetByID(ctx context.Context, id string) (*Comment, error)
	// List devuelve la página solicitada y el total que cumple el filtro.
	List(ctx context.Context, filter CommentFilter) ([]*Comment, int64, error)
	// UpdateStatus cambia el estado y la fecha de revisión. Devuelve
	// ErrNotFound si el comentario no existe. Un comentario rechazado se
	// borra solo a los 30 días, salvo que se apruebe antes.
	UpdateStatus(ctx context.Context, id string, status CommentStatus, reviewedAt time.Time) error
}
