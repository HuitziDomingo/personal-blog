package mongodb

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const usersCollection = "users"

var _ domain.UserRepository = (*UserRepository)(nil)

// userDocument es la forma en que se guarda un usuario en MongoDB.
type userDocument struct {
	ID           bson.ObjectID `bson:"_id"`
	Email        string        `bson:"email"`
	PasswordHash string        `bson:"password_hash"`
	Role         string        `bson:"role"`
	CreatedAt    time.Time     `bson:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at"`
}

func toUserDocument(user *domain.User, id bson.ObjectID) userDocument {
	return userDocument{
		ID:           id,
		Email:        user.Email,
		PasswordHash: user.PasswordHash,
		Role:         string(user.Role),
		CreatedAt:    user.CreatedAt,
		UpdatedAt:    user.UpdatedAt,
	}
}

func toDomainUser(document userDocument) *domain.User {
	return &domain.User{
		ID:           document.ID.Hex(),
		Email:        document.Email,
		PasswordHash: document.PasswordHash,
		Role:         domain.UserRole(document.Role),
		CreatedAt:    document.CreatedAt.UTC(),
		UpdatedAt:    document.UpdatedAt.UTC(),
	}
}

// UserRepository implementa domain.UserRepository sobre MongoDB.
type UserRepository struct {
	users *mongo.Collection
}

// NewUserRepository crea el repositorio de usuarios.
func NewUserRepository(client *Client) *UserRepository {
	return &UserRepository{users: client.database.Collection(usersCollection)}
}

// Create guarda el usuario y le asigna un ID nuevo.
func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
	id := bson.NewObjectID()

	if _, err := r.users.InsertOne(ctx, toUserDocument(user, id)); err != nil {
		return fmt.Errorf("create user: %w", translateUserWriteError(err))
	}

	user.ID = id.Hex()

	return nil
}

// GetByID devuelve el usuario con ese ID. Un ID con formato inválido no puede
// existir, así que también devuelve domain.ErrNotFound.
func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", domain.ErrNotFound)
	}

	user, err := r.findOne(ctx, bson.M{"_id": objectID})
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}

	return user, nil
}

// GetByEmail devuelve el usuario con ese email.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	user, err := r.findOne(ctx, bson.M{"email": email})
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}

	return user, nil
}

// Update guarda los datos editables del usuario; created_at no cambia.
func (r *UserRepository) Update(ctx context.Context, user *domain.User) error {
	objectID, err := bson.ObjectIDFromHex(user.ID)
	if err != nil {
		return fmt.Errorf("update user: %w", domain.ErrNotFound)
	}

	result, err := r.users.UpdateByID(ctx, objectID, bson.M{"$set": bson.M{
		"email":         user.Email,
		"password_hash": user.PasswordHash,
		"role":          string(user.Role),
		"updated_at":    user.UpdatedAt,
	}})
	if err != nil {
		return fmt.Errorf("update user: %w", translateUserWriteError(err))
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("update user: %w", domain.ErrNotFound)
	}

	return nil
}

// Count devuelve el total de usuarios.
func (r *UserRepository) Count(ctx context.Context) (int64, error) {
	total, err := r.users.CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}

	return total, nil
}

func (r *UserRepository) findOne(ctx context.Context, filter bson.M) (*domain.User, error) {
	var document userDocument

	err := r.users.FindOne(ctx, filter).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, domain.ErrNotFound
	}

	if err != nil {
		return nil, err
	}

	return toDomainUser(document), nil
}

// translateUserWriteError traduce la clave duplicada al error del dominio. El
// único índice único de la colección, aparte de _id, es el de email.
func translateUserWriteError(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return domain.ErrDuplicateEmail
	}

	return err
}
