package mongodb

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var testNow = time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)

func newRefreshTokenRepository(t *testing.T) (*RefreshTokenRepository, *Client) {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewRefreshTokenRepository(client), client
}

func newRefreshToken(hash, family string) *domain.RefreshToken {
	return &domain.RefreshToken{
		UserID:    bson.NewObjectID().Hex(),
		FamilyID:  family,
		TokenHash: hash,
		ExpiresAt: testNow.Add(7 * 24 * time.Hour),
		CreatedAt: testNow,
	}
}

func TestRefreshTokenDocumentRoundTrip(t *testing.T) {
	id := bson.NewObjectID()
	revokedAt := testNow.Add(time.Minute)
	token := newRefreshToken("hash", "family")
	token.ID = id.Hex()
	token.RevokedAt = &revokedAt

	assert.Equal(t, token, toDomainRefreshToken(toRefreshTokenDocument(token, id)))
}

func TestRefreshTokenCreateAndGetByHash(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)
	token := newRefreshToken("hash-1", "family-1")

	require.NoError(t, repository.Create(t.Context(), token))
	require.NotEmpty(t, token.ID)

	stored, err := repository.GetByHash(t.Context(), "hash-1")
	require.NoError(t, err)
	assert.Equal(t, token, stored)
	assert.False(t, stored.IsRevoked())

	_, err = repository.GetByHash(t.Context(), "missing")
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestRefreshTokenHashIsUnique(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)
	require.NoError(t, repository.Create(t.Context(), newRefreshToken("hash-1", "family-1")))

	err := repository.Create(t.Context(), newRefreshToken("hash-1", "family-2"))

	require.True(t, mongo.IsDuplicateKeyError(err))
}

func TestRefreshTokenRotate(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)
	old := newRefreshToken("hash-1", "family-1")
	require.NoError(t, repository.Create(t.Context(), old))

	next := newRefreshToken("hash-2", "family-1")
	require.NoError(t, repository.Rotate(t.Context(), "hash-1", next, testNow))
	require.NotEmpty(t, next.ID)

	rotated, err := repository.GetByHash(t.Context(), "hash-1")
	require.NoError(t, err)
	require.True(t, rotated.IsRevoked())
	assert.Equal(t, testNow, *rotated.RevokedAt)
	assert.Equal(t, next.ID, rotated.ReplacedBy)

	current, err := repository.GetByHash(t.Context(), "hash-2")
	require.NoError(t, err)
	assert.False(t, current.IsRevoked())
	assert.Empty(t, current.ReplacedBy)
}

func TestRefreshTokenRotateRejectsUnusableTokens(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)

	require.NoError(t, repository.Create(t.Context(), newRefreshToken("rotated", "family-1")))
	require.NoError(t, repository.Rotate(t.Context(), "rotated", newRefreshToken("current", "family-1"), testNow))

	expired := newRefreshToken("expired", "family-2")
	expired.ExpiresAt = testNow
	require.NoError(t, repository.Create(t.Context(), expired))

	for _, hash := range []string{"rotated", "expired", "missing"} {
		t.Run(hash, func(t *testing.T) {
			err := repository.Rotate(t.Context(), hash, newRefreshToken("next-"+hash, "family-x"), testNow)

			require.ErrorIs(t, err, domain.ErrInvalidToken)

			_, err = repository.GetByHash(t.Context(), "next-"+hash)
			require.ErrorIs(t, err, domain.ErrNotFound, "a failed rotation stores nothing")
		})
	}
}

func TestRefreshTokenConcurrentRotationHasOneWinner(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)
	require.NoError(t, repository.Create(t.Context(), newRefreshToken("shared", "family-1")))

	const contenders = 2
	errs := make([]error, contenders)
	start := make(chan struct{})

	var rotations sync.WaitGroup
	for i := range contenders {
		rotations.Go(func() {
			<-start
			next := newRefreshToken("next-"+strconv.Itoa(i), "family-1")
			errs[i] = repository.Rotate(context.Background(), "shared", next, testNow)
		})
	}

	close(start)
	rotations.Wait()

	var won, lost int
	for _, err := range errs {
		switch {
		case err == nil:
			won++
		case errors.Is(err, domain.ErrInvalidToken):
			lost++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}

	assert.Equal(t, 1, won)
	assert.Equal(t, 1, lost)
}

func TestRefreshTokenRevokeFamily(t *testing.T) {
	repository, _ := newRefreshTokenRepository(t)
	earlier := testNow.Add(-time.Hour)

	require.NoError(t, repository.Create(t.Context(), newRefreshToken("a-old", "family-a")))
	require.NoError(t, repository.Rotate(t.Context(), "a-old", newRefreshToken("a-current", "family-a"), earlier))
	require.NoError(t, repository.Create(t.Context(), newRefreshToken("b-current", "family-b")))

	require.NoError(t, repository.RevokeFamily(t.Context(), "family-a", testNow))

	old, err := repository.GetByHash(t.Context(), "a-old")
	require.NoError(t, err)
	assert.Equal(t, earlier, *old.RevokedAt, "already revoked tokens keep their date")

	current, err := repository.GetByHash(t.Context(), "a-current")
	require.NoError(t, err)
	require.True(t, current.IsRevoked())
	assert.Equal(t, testNow, *current.RevokedAt)

	other, err := repository.GetByHash(t.Context(), "b-current")
	require.NoError(t, err)
	assert.False(t, other.IsRevoked(), "other families are untouched")
}

func TestRefreshTokenIndexes(t *testing.T) {
	_, client := newRefreshTokenRepository(t)

	cursor, err := client.database.Collection(refreshTokensCollection).Indexes().List(t.Context())
	require.NoError(t, err)

	var indexes []bson.M
	require.NoError(t, cursor.All(t.Context(), &indexes))

	byName := map[string]bson.M{}
	for _, index := range indexes {
		byName[index["name"].(string)] = index
	}

	assert.Equal(t, true, byName["token_hash_1"]["unique"])
	assert.EqualValues(t, 0, byName["expires_at_1"]["expireAfterSeconds"])
	assert.Contains(t, byName, "family_id_1")
}
