//go:build gemini_live

package gemini

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// TestModerationSamplesAgainstGemini corre el set de ejemplos contra Gemini
// real, uno por uno y espaciados para respetar la cuota gratuita. Nunca corre
// en CI: necesita el build tag gemini_live y GEMINI_API_KEY. Es para revisar a
// mano la calidad del clasificador (ADR-022, punto 11). Lo normal es correrlo
// con `make api-moderation-samples`, que carga la key de .env sin imprimirla.
//
// MODERATION_LIVE_MODEL cambia el modelo (por defecto gemini-3.6-flash). Usa
// el razonamiento LOW y el límite de salida de producción (512). Un 429
// detiene la corrida: no se reintenta. Al final imprime una tabla esperado
// frente a obtenido, el resumen de aciertos y los resultados como JSON.
func TestModerationSamplesAgainstGemini(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		// Falla sin tocar la red: sin key no hay nada que medir.
		t.Fatal("GEMINI_API_KEY is not set: run `make api-moderation-samples`, which loads it from .env")
	}

	model := os.Getenv("MODERATION_LIVE_MODEL")
	if model == "" {
		model = "gemini-3.6-flash"
	}

	moderator, err := New(t.Context(), Config{APIKey: key, Model: model, ThinkingLevel: "LOW", MaxOutputTokens: 512})
	require.NoError(t, err)

	type liveResult struct {
		ID               string `json:"id"`
		ExpectedCategory string `json:"expectedCategory"`
		ExpectedVerdict  string `json:"expectedVerdict"`
		Category         string `json:"category,omitempty"`
		ModelVerdict     string `json:"modelVerdict,omitempty"`
		StoredVerdict    string `json:"storedVerdict,omitempty"`
		Reason           string `json:"reason,omitempty"`
		Model            string `json:"model,omitempty"`
		LatencyMS        int64  `json:"latencyMs"`
		InputTokens      int    `json:"inputTokens"`
		OutputTokens     int    `json:"outputTokens"`
		Error            string `json:"error,omitempty"`
	}

	var results []liveResult
	for i, sample := range loadModerationSamples(t) {
		if i > 0 {
			time.Sleep(6 * time.Second)
		}

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		start := time.Now()
		output, err := moderator.Classify(ctx, domain.CommentForModeration{PostTitle: sample.PostTitle, Name: sample.Name, Content: sample.Content})
		cancel()

		result := liveResult{
			ID:               sample.ID,
			ExpectedCategory: sample.ExpectedCategory,
			ExpectedVerdict:  sample.ExpectedVerdict,
			LatencyMS:        time.Since(start).Milliseconds(),
			Model:            output.Usage.Model,
			InputTokens:      output.Usage.InputTokens,
			OutputTokens:     output.Usage.OutputTokens,
		}

		if err != nil {
			result.Error = err.Error()
		} else {
			result.Category = string(output.Category)
			result.ModelVerdict = string(output.Verdict)
			result.StoredVerdict = string(output.Verdict)
			if output.Category.NeedsHumanReview() {
				result.StoredVerdict = string(domain.ModerationVerdictReview)
			}
			result.Reason = output.Reason
		}

		results = append(results, result)
		t.Logf("%s: expected %s/%s, got %s/%s (stored %s) in %d ms %s",
			sample.ID, sample.ExpectedCategory, sample.ExpectedVerdict, result.Category, result.ModelVerdict, result.StoredVerdict, result.LatencyMS, result.Error)

		if err != nil && errors.Is(err, domain.ErrAssistantUnavailable) && strings.Contains(err.Error(), "429") {
			t.Log("quota exhausted: stopping without retries")

			break
		}
	}

	samples := len(loadModerationSamples(t))
	var table strings.Builder
	table.WriteString("\n| id | esperado | obtenido | guardado | ¿categoría? | ¿veredicto? | ms |\n|---|---|---|---|---|---|---|\n")
	categoryHits, verdictHits, evaluated := 0, 0, 0
	for _, result := range results {
		categoryOK, verdictOK := "", ""
		if result.Error == "" {
			evaluated++
			if result.Category == result.ExpectedCategory {
				categoryHits++
				categoryOK = "sí"
			} else {
				categoryOK = "no"
			}
			if result.StoredVerdict == result.ExpectedVerdict {
				verdictHits++
				verdictOK = "sí"
			} else {
				verdictOK = "no"
			}
		}
		obtained := result.Category + "/" + result.ModelVerdict
		if result.Error != "" {
			obtained = "error: " + result.Error
		}
		fmt.Fprintf(&table, "| %s | %s/%s | %s | %s | %s | %s | %d |\n",
			result.ID, result.ExpectedCategory, result.ExpectedVerdict, obtained, result.StoredVerdict, categoryOK, verdictOK, result.LatencyMS)
	}
	fmt.Fprintf(&table, "\nEvaluados %d de %d. Categoría correcta: %d de %d. Veredicto guardado correcto: %d de %d.\n",
		evaluated, samples, categoryHits, evaluated, verdictHits, evaluated)
	t.Log(table.String())

	data, err := json.MarshalIndent(results, "", "  ")
	require.NoError(t, err)
	t.Logf("results:\n%s", data)
}
