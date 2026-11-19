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
	cvVersionsCollection = "cv_versions"

	// currentCVIndex es el índice único parcial que garantiza una sola versión
	// vigente por idioma (ADR-028, punto 3).
	currentCVIndex = "one_current_per_language"
)

var _ domain.CVRepository = (*CVRepository)(nil)

// cvVersionDocument es la forma en que se guarda una versión del CV.
type cvVersionDocument struct {
	ID         bson.ObjectID `bson:"_id"`
	Language   string        `bson:"language"`
	Key        string        `bson:"key"`
	URL        string        `bson:"url"`
	Size       int64         `bson:"size"`
	UploadedAt time.Time     `bson:"uploaded_at"`
	Current    bool          `bson:"current"`
}

func toDomainCVVersion(document cvVersionDocument) domain.CVVersion {
	return domain.CVVersion{
		ID:         document.ID.Hex(),
		Language:   domain.CVLanguage(document.Language),
		Key:        document.Key,
		URL:        document.URL,
		Size:       document.Size,
		UploadedAt: document.UploadedAt.UTC(),
		Current:    document.Current,
	}
}

// cvVersionIndexes ordena el listado y limita a una vigente por idioma.
func cvVersionIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{Keys: bson.D{{Key: "uploaded_at", Value: -1}}},
		{
			Keys: bson.D{{Key: "language", Value: 1}},
			Options: options.Index().
				SetName(currentCVIndex).
				SetUnique(true).
				SetPartialFilterExpression(bson.D{{Key: "current", Value: true}}),
		},
	}
}

// CVRepository implementa domain.CVRepository sobre MongoDB.
type CVRepository struct {
	versions *mongo.Collection
}

// NewCVRepository crea el repositorio de versiones del CV.
func NewCVRepository(client *Client) *CVRepository {
	return &CVRepository{versions: client.database.Collection(cvVersionsCollection)}
}

// Create guarda la versión sin marcarla como vigente y le asigna un ID nuevo.
func (r *CVRepository) Create(ctx context.Context, version *domain.CVVersion) error {
	id := bson.NewObjectID()

	document := cvVersionDocument{
		ID:         id,
		Language:   string(version.Language),
		Key:        version.Key,
		URL:        version.URL,
		Size:       version.Size,
		UploadedAt: version.UploadedAt,
	}

	if _, err := r.versions.InsertOne(ctx, document); err != nil {
		return fmt.Errorf("create cv version: %w", err)
	}

	version.ID = id.Hex()
	version.Current = false

	return nil
}

// List devuelve hasta limit versiones, de la más reciente a la más antigua.
func (r *CVRepository) List(ctx context.Context, limit int) ([]domain.CVVersion, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "uploaded_at", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(int64(limit))

	return r.find(ctx, bson.D{}, opts)
}

// Current devuelve las versiones vigentes.
func (r *CVRepository) Current(ctx context.Context) ([]domain.CVVersion, error) {
	return r.find(ctx, bson.D{{Key: "current", Value: true}}, options.Find().SetSort(bson.D{{Key: "language", Value: 1}}))
}

// SetCurrent desmarca la vigente del idioma y marca la versión. Son dos
// escrituras sin transacción (MongoDB local es standalone, ver CLAUDE.md): si
// la API cae entre las dos, el idioma queda sin vigente y la web no muestra el
// botón, pero nunca hay dos vigentes, porque lo impide el índice único.
func (r *CVRepository) SetCurrent(ctx context.Context, id string) (*domain.CVVersion, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("set current cv: %w", domain.ErrNotFound)
	}

	var document cvVersionDocument
	if err := r.versions.FindOne(ctx, bson.D{{Key: "_id", Value: objectID}}).Decode(&document); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, fmt.Errorf("set current cv: %w", domain.ErrNotFound)
		}

		return nil, fmt.Errorf("set current cv: %w", err)
	}

	if document.Current {
		version := toDomainCVVersion(document)

		return &version, nil
	}

	unset := bson.D{
		{Key: "language", Value: document.Language},
		{Key: "current", Value: true},
		{Key: "_id", Value: bson.D{{Key: "$ne", Value: objectID}}},
	}
	if _, err := r.versions.UpdateMany(ctx, unset, bson.D{{Key: "$set", Value: bson.D{{Key: "current", Value: false}}}}); err != nil {
		return nil, fmt.Errorf("set current cv: unset previous: %w", err)
	}

	if _, err := r.versions.UpdateOne(ctx, bson.D{{Key: "_id", Value: objectID}}, bson.D{{Key: "$set", Value: bson.D{{Key: "current", Value: true}}}}); err != nil {
		return nil, fmt.Errorf("set current cv: %w", err)
	}

	document.Current = true
	version := toDomainCVVersion(document)

	return &version, nil
}

func (r *CVRepository) find(ctx context.Context, filter bson.D, opts *options.FindOptionsBuilder) ([]domain.CVVersion, error) {
	cursor, err := r.versions.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("find cv versions: %w", err)
	}

	var documents []cvVersionDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, fmt.Errorf("decode cv versions: %w", err)
	}

	versions := make([]domain.CVVersion, 0, len(documents))
	for _, document := range documents {
		versions = append(versions, toDomainCVVersion(document))
	}

	return versions, nil
}
