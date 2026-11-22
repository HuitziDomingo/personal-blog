package gemini

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

// ragEvalSet es el set de evaluación del RAG (ADR-027, punto 12): posts de
// ejemplo y consultas con el post que debería recuperarse. Sirve para medir
// recall@4 a mano con el modelo real (make api-rag-eval); en CI solo se
// comprueba que esté completo.
type ragEvalSet struct {
	Posts []struct {
		Slug    string `json:"slug"`
		Title   string `json:"title"`
		Content string `json:"content"`
	} `json:"posts"`
	Queries []struct {
		ID           string `json:"id"`
		Query        string `json:"query"`
		ExpectedSlug string `json:"expectedSlug"`
	} `json:"queries"`
}

func loadRAGEvalSet(t *testing.T) ragEvalSet {
	t.Helper()

	raw, err := fixtures.ReadFile("testdata/rag_eval.json")
	require.NoError(t, err)

	var set ragEvalSet
	require.NoError(t, json.Unmarshal(raw, &set))

	return set
}

func TestRAGEvalSetIsComplete(t *testing.T) {
	set := loadRAGEvalSet(t)

	slugs := map[string]bool{}
	for _, post := range set.Posts {
		require.False(t, slugs[post.Slug], "slug repetido: %s", post.Slug)
		slugs[post.Slug] = true
		assert.NotEmpty(t, service.SplitMarkdown(post.Content, service.DefaultChunkMaxChars), post.Slug)
	}

	ids := map[string]bool{}
	for _, query := range set.Queries {
		require.False(t, ids[query.ID], "id repetido: %s", query.ID)
		ids[query.ID] = true
		assert.True(t, slugs[query.ExpectedSlug], "%s espera un post que no está en el set: %s", query.ID, query.ExpectedSlug)
	}

	assert.GreaterOrEqual(t, len(set.Queries), 10)
	assert.GreaterOrEqual(t, len(set.Posts), 8, "con pocos posts, recall@4 no mide nada")
}
