package gemini

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// moderationSample es un comentario de ejemplo con la categoría que debería
// sugerir el clasificador. El set sirve para revisar a mano la calidad con el
// modelo real (ADR-022, punto 11); en CI solo se comprueba que esté completo.
type moderationSample struct {
	ID               string `json:"id"`
	PostTitle        string `json:"postTitle"`
	Name             string `json:"name"`
	Content          string `json:"content"`
	ExpectedCategory string `json:"expectedCategory"`
	ExpectedVerdict  string `json:"expectedVerdict"`
}

func loadModerationSamples(t *testing.T) []moderationSample {
	t.Helper()

	raw, err := fixtures.ReadFile("testdata/moderation_samples.json")
	require.NoError(t, err)

	var samples []moderationSample
	require.NoError(t, json.Unmarshal(raw, &samples))

	return samples
}

func TestModerationSamplesCoverEveryCase(t *testing.T) {
	samples := loadModerationSamples(t)

	perCategory := map[domain.ModerationCategory]int{}
	ids := map[string]bool{}
	for _, sample := range samples {
		category := domain.ModerationCategory(sample.ExpectedCategory)
		require.True(t, category.IsValid(), sample.ID)
		require.True(t, domain.ModerationVerdict(sample.ExpectedVerdict).IsValid(), sample.ID)
		require.False(t, ids[sample.ID], "id repetido: %s", sample.ID)
		ids[sample.ID] = true
		perCategory[category]++
	}

	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategoryNone], 4)
	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategorySpam], 3)
	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategoryAbuse], 3)
	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategoryPromptInjection], 3)
	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategoryPersonalData], 2)
	assert.GreaterOrEqual(t, perCategory[domain.ModerationCategoryOffTopic], 1)
}
