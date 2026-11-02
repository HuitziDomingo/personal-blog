package mongodb

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const cleanupTimeout = 10 * time.Second

// newTestClient conecta a una base de datos propia del test y la borra al
// terminar. El test se salta si no hay un MongoDB disponible.
func newTestClient(t *testing.T) *Client {
	t.Helper()

	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("MONGO_TEST_URI is not set")
	}

	client, err := Connect(t.Context(), uri, "test_"+bson.NewObjectID().Hex())
	require.NoError(t, err)

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
		defer cancel()

		assert.NoError(t, client.database.Drop(ctx))
		assert.NoError(t, client.Disconnect(ctx))
	})

	return client
}

func newTestRepository(t *testing.T) *UserRepository {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewUserRepository(client)
}

func newUser(email string) *domain.User {
	now := time.Now().UTC().Truncate(time.Millisecond)

	return &domain.User{
		Email:        email,
		PasswordHash: "hash",
		Role:         domain.UserRoleAdmin,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

func TestUserDocumentRoundTrip(t *testing.T) {
	id := bson.NewObjectID()
	user := newUser("admin@huitzi.xyz")
	user.ID = id.Hex()

	assert.Equal(t, user, toDomainUser(toUserDocument(user, id)))
}

func TestUserRepositoryCreateAndGet(t *testing.T) {
	repository := newTestRepository(t)
	user := newUser("admin@huitzi.xyz")

	require.NoError(t, repository.Create(t.Context(), user))
	require.NotEmpty(t, user.ID)

	byID, err := repository.GetByID(t.Context(), user.ID)
	require.NoError(t, err)
	assert.Equal(t, user, byID)

	byEmail, err := repository.GetByEmail(t.Context(), user.Email)
	require.NoError(t, err)
	assert.Equal(t, user, byEmail)
}

func TestUserRepositoryCreateRejectsDuplicateEmail(t *testing.T) {
	repository := newTestRepository(t)
	require.NoError(t, repository.Create(t.Context(), newUser("admin@huitzi.xyz")))

	err := repository.Create(t.Context(), newUser("admin@huitzi.xyz"))

	require.ErrorIs(t, err, domain.ErrDuplicateEmail)
}

func TestUserRepositoryNotFound(t *testing.T) {
	repository := newTestRepository(t)
	missingID := bson.NewObjectID().Hex()

	tests := []struct {
		name string
		call func(ctx context.Context) error
	}{
		{name: "get by id", call: func(ctx context.Context) error {
			_, err := repository.GetByID(ctx, missingID)

			return err
		}},
		{name: "get by invalid id", call: func(ctx context.Context) error {
			_, err := repository.GetByID(ctx, "not-an-object-id")

			return err
		}},
		{name: "get by email", call: func(ctx context.Context) error {
			_, err := repository.GetByEmail(ctx, "nobody@huitzi.xyz")

			return err
		}},
		{name: "update", call: func(ctx context.Context) error {
			user := newUser("nobody@huitzi.xyz")
			user.ID = missingID

			return repository.Update(ctx, user)
		}},
		{name: "update with invalid id", call: func(ctx context.Context) error {
			user := newUser("nobody@huitzi.xyz")
			user.ID = "not-an-object-id"

			return repository.Update(ctx, user)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.ErrorIs(t, tt.call(t.Context()), domain.ErrNotFound)
		})
	}
}

func TestUserRepositoryUpdateKeepsCreatedAt(t *testing.T) {
	repository := newTestRepository(t)
	user := newUser("admin@huitzi.xyz")
	require.NoError(t, repository.Create(t.Context(), user))

	updated := *user
	updated.Email = "new@huitzi.xyz"
	updated.PasswordHash = "new-hash"
	updated.CreatedAt = user.CreatedAt.Add(time.Hour)
	updated.UpdatedAt = user.UpdatedAt.Add(time.Minute)
	require.NoError(t, repository.Update(t.Context(), &updated))

	stored, err := repository.GetByID(t.Context(), user.ID)
	require.NoError(t, err)
	assert.Equal(t, "new@huitzi.xyz", stored.Email)
	assert.Equal(t, "new-hash", stored.PasswordHash)
	assert.Equal(t, updated.UpdatedAt, stored.UpdatedAt)
	assert.Equal(t, user.CreatedAt, stored.CreatedAt)
}

func TestUserRepositoryUpdateRejectsDuplicateEmail(t *testing.T) {
	repository := newTestRepository(t)
	require.NoError(t, repository.Create(t.Context(), newUser("taken@huitzi.xyz")))
	user := newUser("admin@huitzi.xyz")
	require.NoError(t, repository.Create(t.Context(), user))

	user.Email = "taken@huitzi.xyz"
	err := repository.Update(t.Context(), user)

	require.ErrorIs(t, err, domain.ErrDuplicateEmail)
}

func TestUserRepositoryCount(t *testing.T) {
	repository := newTestRepository(t)

	total, err := repository.Count(t.Context())
	require.NoError(t, err)
	assert.Zero(t, total)

	require.NoError(t, repository.Create(t.Context(), newUser("admin@huitzi.xyz")))

	total, err = repository.Count(t.Context())
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
}

func TestEnsureIndexesIsIdempotent(t *testing.T) {
	client := newTestClient(t)

	require.NoError(t, client.EnsureIndexes(t.Context()))
	require.NoError(t, client.EnsureIndexes(t.Context()))
}
