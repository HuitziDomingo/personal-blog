//go:build gemini_live

package gemini

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

// TestRAGEvalAgainstGemini mide recall@4 del RAG con embeddings reales
// (ADR-027, punto 12): fragmenta los posts del set como en producción, genera
// sus embeddings y, por cada consulta, mira si el post esperado está entre
// los 4 fragmentos más parecidos. Nunca corre en CI: necesita el build tag
// gemini_live y GEMINI_API_KEY. Lo normal es `make api-rag-eval`, que carga la
// key de .env sin imprimirla.
//
// RAG_EVAL_MODEL cambia el modelo (por defecto gemini-embedding-2) y
// RAG_MIN_SCORE el umbral (por defecto 0.60, el de la API). El recall se mide sin umbral; la
// tabla dice además qué fragmentos lo superan, para ajustarlo. Hace una
// petición por post y una por consulta, espaciadas; un error detiene la
// corrida sin reintentar.
func TestRAGEvalAgainstGemini(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Fatal("GEMINI_API_KEY is not set: run `make api-rag-eval`, which loads it from .env")
	}

	model := os.Getenv("RAG_EVAL_MODEL")
	if model == "" {
		model = "gemini-embedding-2"
	}

	minScore := 0.60
	if value := os.Getenv("RAG_MIN_SCORE"); value != "" {
		parsed, err := strconv.ParseFloat(value, 64)
		require.NoError(t, err, "RAG_MIN_SCORE")
		minScore = parsed
	}

	embedder, err := NewEmbedder(t.Context(), EmbedderConfig{APIKey: key, Model: model})
	require.NoError(t, err)

	const spacing = 2 * time.Second
	set := loadRAGEvalSet(t)

	var chunks []domain.Chunk
	for _, post := range set.Posts {
		pieces := service.SplitMarkdown(post.Content, service.DefaultChunkMaxChars)
		documents := make([]domain.EmbeddingDocument, len(pieces))
		for i, piece := range pieces {
			title := post.Title
			if piece.Section != "" {
				title += " — " + piece.Section
			}

			documents[i] = domain.EmbeddingDocument{Title: title, Text: piece.Text}
		}

		vectors, err := embedder.EmbedDocuments(t.Context(), documents)
		require.NoError(t, err, post.Slug)

		for i, piece := range pieces {
			chunks = append(chunks, domain.Chunk{PostID: post.Slug, Slug: post.Slug, Section: piece.Section, Embedding: vectors[i], Model: model})
		}

		time.Sleep(spacing)
	}

	var report strings.Builder
	fmt.Fprintf(&report, "\nmodelo %s, %d posts, %d fragmentos, umbral %.2f\n\n", model, len(set.Posts), len(chunks), minScore)
	fmt.Fprintf(&report, "%-22s %-4s %-30s %s\n", "consulta", "ok", "esperado", "top-4 (score, * = supera el umbral)")

	hits := 0
	for _, query := range set.Queries {
		vector, err := embedder.EmbedQuery(t.Context(), query.Query)
		require.NoError(t, err, query.ID)

		top := service.TopChunks(vector, chunks, "", -1, service.MaxContextChunks)

		found := false
		results := make([]string, len(top))
		for i, chunk := range top {
			mark := ""
			if chunk.Score >= minScore {
				mark = "*"
			}

			results[i] = fmt.Sprintf("%s %.3f%s", chunk.Slug, chunk.Score, mark)
			found = found || chunk.Slug == query.ExpectedSlug
		}

		if found {
			hits++
		}

		fmt.Fprintf(&report, "%-22s %-4t %-30s %s\n", query.ID, found, query.ExpectedSlug, strings.Join(results, ", "))
		time.Sleep(spacing)
	}

	fmt.Fprintf(&report, "\nrecall@4: %d/%d = %.2f\n", hits, len(set.Queries), float64(hits)/float64(len(set.Queries)))
	t.Log(report.String())
}
