package mongodb

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	commentsCollection = "comments"

	// rejectedCommentTTL es cuánto se guarda un comentario rechazado
	// (ADR-022, punto 9). Lo borra el índice TTL de rejected_at.
	rejectedCommentTTL = 30 * 24 * time.Hour
)

var _ domain.CommentRepository = (*CommentRepository)(nil)

// commentDocument es la forma en que se guarda un comentario. No tiene IP,
// correo ni user agent (ADR-022, punto 1).
type commentDocument struct {
	ID         bson.ObjectID       `bson:"_id"`
	PostID     string              `bson:"post_id"`
	ParentID   string              `bson:"parent_id,omitempty"`
	Name       string              `bson:"name"`
	Content    string              `bson:"content"`
	Status     string              `bson:"status"`
	ByAuthor   bool                `bson:"by_author"`
	Moderation *moderationDocument `bson:"moderation,omitempty"`
	CreatedAt  time.Time           `bson:"created_at"`
	ReviewedAt *time.Time          `bson:"reviewed_at,omitempty"`
	// RejectedAt solo existe mientras el comentario está rechazado: el
	// índice TTL borra el documento 30 días después.
	RejectedAt *time.Time `bson:"rejected_at,omitempty"`
}

type moderationDocument struct {
	Verdict    string    `bson:"verdict"`
	Category   string    `bson:"category"`
	Reason     string    `bson:"reason"`
	Model      string    `bson:"model"`
	AnalyzedAt time.Time `bson:"analyzed_at"`
}

func toCommentDocument(comment *domain.Comment, id bson.ObjectID) commentDocument {
	document := commentDocument{
		ID:         id,
		PostID:     comment.PostID,
		ParentID:   comment.ParentID,
		Name:       comment.Name,
		Content:    comment.Content,
		Status:     string(comment.Status),
		ByAuthor:   comment.ByAuthor,
		CreatedAt:  comment.CreatedAt,
		ReviewedAt: comment.ReviewedAt,
	}

	if comment.Status == domain.CommentStatusRejected {
		document.RejectedAt = comment.ReviewedAt
	}

	if m := comment.Moderation; m != nil {
		document.Moderation = &moderationDocument{
			Verdict:    string(m.Verdict),
			Category:   string(m.Category),
			Reason:     m.Reason,
			Model:      m.Model,
			AnalyzedAt: m.AnalyzedAt,
		}
	}

	return document
}

func toDomainComment(document commentDocument) *domain.Comment {
	comment := &domain.Comment{
		ID:        document.ID.Hex(),
		PostID:    document.PostID,
		ParentID:  document.ParentID,
		Name:      document.Name,
		Content:   document.Content,
		Status:    domain.CommentStatus(document.Status),
		ByAuthor:  document.ByAuthor,
		CreatedAt: document.CreatedAt.UTC(),
	}

	if document.ReviewedAt != nil {
		reviewedAt := document.ReviewedAt.UTC()
		comment.ReviewedAt = &reviewedAt
	}

	if m := document.Moderation; m != nil {
		comment.Moderation = &domain.Moderation{
			Verdict:    domain.ModerationVerdict(m.Verdict),
			Category:   domain.ModerationCategory(m.Category),
			Reason:     m.Reason,
			Model:      m.Model,
			AnalyzedAt: m.AnalyzedAt.UTC(),
		}
	}

	return comment
}

// CommentRepository implementa domain.CommentRepository sobre MongoDB.
type CommentRepository struct {
	comments *mongo.Collection
}

// NewCommentRepository crea el repositorio de comentarios.
func NewCommentRepository(client *Client) *CommentRepository {
	return &CommentRepository{comments: client.database.Collection(commentsCollection)}
}

// Create guarda el comentario y le asigna un ID nuevo.
func (r *CommentRepository) Create(ctx context.Context, comment *domain.Comment) error {
	id := bson.NewObjectID()

	if _, err := r.comments.InsertOne(ctx, toCommentDocument(comment, id)); err != nil {
		return fmt.Errorf("create comment: %w", err)
	}

	comment.ID = id.Hex()

	return nil
}

// GetByID devuelve el comentario. Un ID con formato inválido no puede existir,
// así que también devuelve domain.ErrNotFound (ADR-010).
func (r *CommentRepository) GetByID(ctx context.Context, id string) (*domain.Comment, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("get comment: %w", domain.ErrNotFound)
	}

	var document commentDocument

	err = r.comments.FindOne(ctx, bson.D{{Key: "_id", Value: objectID}}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, fmt.Errorf("get comment: %w", domain.ErrNotFound)
	}

	if err != nil {
		return nil, fmt.Errorf("get comment: %w", err)
	}

	return toDomainComment(document), nil
}

// List devuelve una página de comentarios, del más antiguo al más reciente, y
// el total que cumple el filtro. Limit debe ser positivo.
func (r *CommentRepository) List(ctx context.Context, filter domain.CommentFilter) ([]*domain.Comment, int64, error) {
	if filter.Limit <= 0 || filter.Offset < 0 {
		return nil, 0, fmt.Errorf("list comments: limit %d, offset %d: %w", filter.Limit, filter.Offset, domain.ErrInvalidInput)
	}

	query := commentListQuery(filter)

	total, err := r.comments.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, fmt.Errorf("count comments: %w", err)
	}

	// Desempata por _id para que la paginación sea estable.
	findOptions := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}).
		SetSkip(int64(filter.Offset)).
		SetLimit(int64(filter.Limit))

	cursor, err := r.comments.Find(ctx, query, findOptions)
	if err != nil {
		return nil, 0, fmt.Errorf("list comments: %w", err)
	}

	var documents []commentDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, 0, fmt.Errorf("decode comments: %w", err)
	}

	comments := make([]*domain.Comment, 0, len(documents))
	for _, document := range documents {
		comments = append(comments, toDomainComment(document))
	}

	return comments, total, nil
}

// UpdateStatus cambia el estado y la fecha de revisión. Si el comentario ya
// tiene ese estado no cambia nada, ni la fecha: volver a rechazar no reinicia
// los 30 días. Rechazar fija rejected_at para el índice TTL; aprobar lo quita.
func (r *CommentRepository) UpdateStatus(ctx context.Context, id string, status domain.CommentStatus, reviewedAt time.Time) error {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("update comment status: %w", domain.ErrNotFound)
	}

	set := bson.D{{Key: "status", Value: string(status)}, {Key: "reviewed_at", Value: reviewedAt}}
	update := bson.D{{Key: "$set", Value: set}, {Key: "$unset", Value: bson.D{{Key: "rejected_at", Value: ""}}}}

	if status == domain.CommentStatusRejected {
		set = append(set, bson.E{Key: "rejected_at", Value: reviewedAt})
		update = bson.D{{Key: "$set", Value: set}}
	}

	filter := bson.D{{Key: "_id", Value: objectID}, {Key: "status", Value: bson.D{{Key: "$ne", Value: string(status)}}}}

	result, err := r.comments.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("update comment status: %w", err)
	}

	if result.MatchedCount > 0 {
		return nil
	}

	// No coincidió: o no existe, o ya tenía ese estado.
	count, err := r.comments.CountDocuments(ctx, bson.D{{Key: "_id", Value: objectID}})
	if err != nil {
		return fmt.Errorf("update comment status: %w", err)
	}

	if count == 0 {
		return fmt.Errorf("update comment status: %w", domain.ErrNotFound)
	}

	return nil
}

// SetModeration guarda el análisis del clasificador, reemplazando el anterior.
func (r *CommentRepository) SetModeration(ctx context.Context, id string, moderation domain.Moderation) error {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return fmt.Errorf("set comment moderation: %w", domain.ErrNotFound)
	}

	document := moderationDocument{
		Verdict:    string(moderation.Verdict),
		Category:   string(moderation.Category),
		Reason:     moderation.Reason,
		Model:      moderation.Model,
		AnalyzedAt: moderation.AnalyzedAt,
	}

	result, err := r.comments.UpdateOne(ctx,
		bson.D{{Key: "_id", Value: objectID}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "moderation", Value: document}}}},
	)
	if err != nil {
		return fmt.Errorf("set comment moderation: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("set comment moderation: %w", domain.ErrNotFound)
	}

	return nil
}

// commentListQuery construye el filtro solo con los campos tipados de
// domain.CommentFilter (ADR-010).
func commentListQuery(filter domain.CommentFilter) bson.D {
	query := bson.D{}

	if filter.PostID != "" {
		query = append(query, bson.E{Key: "post_id", Value: filter.PostID})
	}

	if filter.Status != "" {
		query = append(query, bson.E{Key: "status", Value: string(filter.Status)})
	}

	return query
}

// commentIndexes cubren la lectura pública (aprobados de un post), la cola del
// admin (por estado) y el borrado de los rechazados a los 30 días.
func commentIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{Keys: bson.D{{Key: "post_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}},
		{
			Keys:    bson.D{{Key: "rejected_at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(int32(rejectedCommentTTL.Seconds())),
		},
	}
}
