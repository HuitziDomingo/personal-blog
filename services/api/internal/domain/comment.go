package domain

import (
	"context"
	"errors"
	"time"
)

// Errores de la moderación con LLM (ADR-022). Los dos se responden con 503 al
// pedir el análisis desde el admin; al enviar un comentario, ninguno impide
// guardarlo.
var (
	// ErrModerationDisabled indica que la moderación está apagada por
	// configuración (COMMENTS_MODERATION_ENABLED=false).
	ErrModerationDisabled = errors.New("comment moderation is disabled")

	// ErrModerationUnavailable indica que el clasificador falló, tardó más que
	// el timeout o devolvió una salida inválida.
	ErrModerationUnavailable = errors.New("comment moderation is unavailable")
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

// IsValid indica si el veredicto pertenece al enum.
func (v ModerationVerdict) IsValid() bool {
	switch v {
	case ModerationVerdictApprove, ModerationVerdictReject, ModerationVerdictReview:
		return true
	default:
		return false
	}
}

// IsValid indica si la categoría pertenece al enum.
func (c ModerationCategory) IsValid() bool {
	switch c {
	case ModerationCategoryNone, ModerationCategorySpam, ModerationCategoryAbuse,
		ModerationCategoryOffTopic, ModerationCategoryPromptInjection, ModerationCategoryPersonalData:
		return true
	default:
		return false
	}
}

// NeedsHumanReview indica las categorías que siempre van a revisión humana,
// diga lo que diga el veredicto (ADR-022, punto 5): un intento de dar órdenes
// al moderador o un dato personal no se aprueban ni se rechazan por sugerencia
// del modelo.
func (c ModerationCategory) NeedsHumanReview() bool {
	return c == ModerationCategoryPromptInjection || c == ModerationCategoryPersonalData
}

// CommentForModeration es lo único que se envía al clasificador: el título
// del post como contexto, y el nombre y el texto del comentario. Nunca IDs,
// fechas ni datos de otros comentarios.
type CommentForModeration struct {
	PostTitle string
	Name      string
	Content   string
}

// ModerationResult es la salida del clasificador, sin validar.
type ModerationResult struct {
	Verdict  ModerationVerdict
	Category ModerationCategory
	Reason   string
	Usage    AssistantUsage
}

// CommentModerator es el puerto del clasificador de comentarios (ADR-022,
// punto 4). Una llamada al modelo, sin herramientas ni reintentos. Un error
// del proveedor nunca incluye el comentario ni la API key.
type CommentModerator interface {
	Classify(ctx context.Context, comment CommentForModeration) (ModerationResult, error)
}

// Comment es un comentario en un post. No guarda IP, correo, user agent ni
// ningún otro identificador de quien lo escribió (ADR-022, punto 1).
type Comment struct {
	ID     string
	PostID string
	// PostTitle y PostSlug son los datos actuales del post, para la cola del
	// admin. No se guardan con el comentario: el service los completa al leer
	// y quedan vacíos si el post ya no existe.
	PostTitle string
	PostSlug  string
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
	// SetModeration guarda el análisis, reemplazando el anterior. Devuelve
	// ErrNotFound si el comentario no existe.
	SetModeration(ctx context.Context, id string, moderation Moderation) error
}
