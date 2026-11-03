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

const refreshTokensCollection = "refresh_tokens"

var _ domain.RefreshTokenRepository = (*RefreshTokenRepository)(nil)

// refreshTokenDocument es la forma en que se guarda un token de refresco.
type refreshTokenDocument struct {
	ID         bson.ObjectID  `bson:"_id"`
	UserID     string         `bson:"user_id"`
	FamilyID   string         `bson:"family_id"`
	TokenHash  string         `bson:"token_hash"`
	ExpiresAt  time.Time      `bson:"expires_at"`
	CreatedAt  time.Time      `bson:"created_at"`
	RevokedAt  *time.Time     `bson:"revoked_at"`
	ReplacedBy *bson.ObjectID `bson:"replaced_by"`
}

func toRefreshTokenDocument(token *domain.RefreshToken, id bson.ObjectID) refreshTokenDocument {
	return refreshTokenDocument{
		ID:        id,
		UserID:    token.UserID,
		FamilyID:  token.FamilyID,
		TokenHash: token.TokenHash,
		ExpiresAt: token.ExpiresAt,
		CreatedAt: token.CreatedAt,
		RevokedAt: token.RevokedAt,
	}
}

func toDomainRefreshToken(document refreshTokenDocument) *domain.RefreshToken {
	token := &domain.RefreshToken{
		ID:        document.ID.Hex(),
		UserID:    document.UserID,
		FamilyID:  document.FamilyID,
		TokenHash: document.TokenHash,
		ExpiresAt: document.ExpiresAt.UTC(),
		CreatedAt: document.CreatedAt.UTC(),
	}

	if document.RevokedAt != nil {
		revokedAt := document.RevokedAt.UTC()
		token.RevokedAt = &revokedAt
	}

	if document.ReplacedBy != nil {
		token.ReplacedBy = document.ReplacedBy.Hex()
	}

	return token
}

// RefreshTokenRepository implementa domain.RefreshTokenRepository sobre MongoDB.
type RefreshTokenRepository struct {
	tokens *mongo.Collection
}

// NewRefreshTokenRepository crea el repositorio de tokens de refresco.
func NewRefreshTokenRepository(client *Client) *RefreshTokenRepository {
	return &RefreshTokenRepository{tokens: client.database.Collection(refreshTokensCollection)}
}

// Create guarda el token y le asigna un ID nuevo.
func (r *RefreshTokenRepository) Create(ctx context.Context, token *domain.RefreshToken) error {
	id := bson.NewObjectID()

	if _, err := r.tokens.InsertOne(ctx, toRefreshTokenDocument(token, id)); err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}

	token.ID = id.Hex()

	return nil
}

// GetByHash devuelve el token con ese hash, esté vigente o no.
func (r *RefreshTokenRepository) GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	var document refreshTokenDocument

	err := r.tokens.FindOne(ctx, bson.M{"token_hash": tokenHash}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, fmt.Errorf("get refresh token: %w", domain.ErrNotFound)
	}

	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}

	return toDomainRefreshToken(document), nil
}

// Rotate revoca el token vigente y guarda el siguiente. El filtro de
// FindOneAndUpdate exige que el token siga vigente, y MongoDB aplica la
// actualización de un documento de forma atómica: de dos rotaciones
// simultáneas, solo una encuentra el token sin revocar.
func (r *RefreshTokenRepository) Rotate(ctx context.Context, oldHash string, next *domain.RefreshToken, now time.Time) error {
	nextID := bson.NewObjectID()

	filter := bson.M{
		"token_hash": oldHash,
		"revoked_at": nil,
		"expires_at": bson.M{"$gt": now},
	}
	update := bson.M{"$set": bson.M{"revoked_at": now, "replaced_by": nextID}}

	err := r.tokens.FindOneAndUpdate(ctx, filter, update).Err()
	if errors.Is(err, mongo.ErrNoDocuments) {
		return fmt.Errorf("rotate refresh token: %w", domain.ErrInvalidToken)
	}

	if err != nil {
		return fmt.Errorf("rotate refresh token: %w", err)
	}

	if _, err := r.tokens.InsertOne(ctx, toRefreshTokenDocument(next, nextID)); err != nil {
		return fmt.Errorf("store rotated refresh token: %w", err)
	}

	next.ID = nextID.Hex()

	return nil
}

// RevokeFamily revoca los tokens vigentes de la familia. Los ya revocados
// conservan su fecha original.
func (r *RefreshTokenRepository) RevokeFamily(ctx context.Context, familyID string, now time.Time) error {
	filter := bson.M{"family_id": familyID, "revoked_at": nil}

	if _, err := r.tokens.UpdateMany(ctx, filter, bson.M{"$set": bson.M{"revoked_at": now}}); err != nil {
		return fmt.Errorf("revoke refresh token family: %w", err)
	}

	return nil
}

// refreshTokenIndexes son el índice único del hash, el TTL que borra los tokens
// expirados y el índice de familia para RevokeFamily.
func refreshTokenIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{Keys: bson.D{{Key: "token_hash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
		{Keys: bson.D{{Key: "family_id", Value: 1}}},
	}
}
