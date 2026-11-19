package mongodb

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var cvTestTime = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

func newTestCVRepository(t *testing.T) (*CVRepository, *Client) {
	t.Helper()

	client := newTestClient(t)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	return NewCVRepository(client), client
}

func createCVVersion(t *testing.T, repository *CVRepository, language domain.CVLanguage, uploadedAt time.Time) domain.CVVersion {
	t.Helper()

	version := domain.CVVersion{
		Language:   language,
		Key:        "cv/" + string(language) + "/" + bson.NewObjectID().Hex() + ".pdf",
		URL:        "https://files.example/cv.pdf",
		Size:       1234,
		UploadedAt: uploadedAt,
	}
	require.NoError(t, repository.Create(t.Context(), &version))

	return version
}

func TestCVVersionRoundTrip(t *testing.T) {
	repository, _ := newTestCVRepository(t)

	created := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime)
	require.NotEmpty(t, created.ID)
	assert.False(t, created.Current)

	versions, err := repository.List(t.Context(), 10)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	assert.Equal(t, created, versions[0])

	current, err := repository.Current(t.Context())
	require.NoError(t, err)
	assert.Empty(t, current, "a new version is not current until SetCurrent")
}

func TestCVVersionListIsNewestFirstAndLimited(t *testing.T) {
	repository, _ := newTestCVRepository(t)

	oldest := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime)
	newest := createCVVersion(t, repository, domain.CVLanguageEN, cvTestTime.Add(2*time.Hour))
	middle := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime.Add(time.Hour))

	versions, err := repository.List(t.Context(), 10)
	require.NoError(t, err)
	require.Len(t, versions, 3)
	assert.Equal(t, []string{newest.ID, middle.ID, oldest.ID}, []string{versions[0].ID, versions[1].ID, versions[2].ID})

	limited, err := repository.List(t.Context(), 2)
	require.NoError(t, err)
	assert.Len(t, limited, 2)
}

func TestCVVersionSetCurrentKeepsOnePerLanguage(t *testing.T) {
	repository, _ := newTestCVRepository(t)

	firstES := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime)
	secondES := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime.Add(time.Hour))
	english := createCVVersion(t, repository, domain.CVLanguageEN, cvTestTime)

	for _, id := range []string{firstES.ID, english.ID, secondES.ID} {
		version, err := repository.SetCurrent(t.Context(), id)
		require.NoError(t, err)
		assert.True(t, version.Current)
	}

	current, err := repository.Current(t.Context())
	require.NoError(t, err)
	require.Len(t, current, 2)
	assert.Equal(t, english.ID, current[0].ID, "sorted by language: en, es")
	assert.Equal(t, secondES.ID, current[1].ID)

	// Marcar la vigente no cambia nada.
	again, err := repository.SetCurrent(t.Context(), secondES.ID)
	require.NoError(t, err)
	assert.True(t, again.Current)
}

func TestCVVersionUniqueIndexRejectsTwoCurrent(t *testing.T) {
	repository, client := newTestCVRepository(t)

	first := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime)
	second := createCVVersion(t, repository, domain.CVLanguageES, cvTestTime)
	_, err := repository.SetCurrent(t.Context(), first.ID)
	require.NoError(t, err)

	secondID, err := bson.ObjectIDFromHex(second.ID)
	require.NoError(t, err)

	_, err = client.database.Collection(cvVersionsCollection).UpdateOne(t.Context(),
		bson.D{{Key: "_id", Value: secondID}},
		bson.D{{Key: "$set", Value: bson.D{{Key: "current", Value: true}}}},
	)
	require.Error(t, err, "the partial unique index forbids a second current version")
}

func TestCVVersionSetCurrentNotFound(t *testing.T) {
	repository, _ := newTestCVRepository(t)

	_, err := repository.SetCurrent(t.Context(), bson.NewObjectID().Hex())
	require.ErrorIs(t, err, domain.ErrNotFound)

	_, err = repository.SetCurrent(t.Context(), "not-an-id")
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCVVersionIndexesAreIdempotent(t *testing.T) {
	_, client := newTestCVRepository(t)

	require.NoError(t, client.EnsureIndexes(t.Context()))
}
