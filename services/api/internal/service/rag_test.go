package service

import (
	"bytes"
	"context"
	"hash/fnv"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// fakeEmbedder genera vectores deterministas sin red (ADR-015): cada palabra
// suma 1 en una dimensión elegida por su hash. Textos con palabras en común
// se parecen; textos sin ninguna, no.
type fakeEmbedder struct {
	mu        sync.Mutex
	model     string
	documents [][]domain.EmbeddingDocument
	queries   []string
	// failAfter hace fallar las llamadas a EmbedDocuments desde la número
	// failAfter+1 (0 = nunca falla).
	failAfter int
	err       error
}

var _ domain.Embedder = (*fakeEmbedder)(nil)

func (f *fakeEmbedder) Model() string { return f.model }

func (f *fakeEmbedder) EmbedDocuments(_ context.Context, documents []domain.EmbeddingDocument) ([][]float32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.documents = append(f.documents, documents)
	if f.err != nil && len(f.documents) > f.failAfter {
		return nil, f.err
	}

	vectors := make([][]float32, len(documents))
	for i, document := range documents {
		vectors[i] = wordVector(document.Title + " " + document.Text)
	}

	return vectors, nil
}

func (f *fakeEmbedder) EmbedQuery(_ context.Context, text string) ([]float32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.queries = append(f.queries, text)

	return wordVector(text), nil
}

func (f *fakeEmbedder) documentCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.documents)
}

func wordVector(text string) []float32 {
	vector := make([]float32, domain.EmbeddingDimensions)
	for _, word := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) }) {
		hash := fnv.New32a()
		_, _ = hash.Write([]byte(word))
		vector[hash.Sum32()%domain.EmbeddingDimensions]++
	}

	return vector
}

// fakeChunkRepository guarda los fragmentos en memoria. Tiene mutex porque la
// indexación corre en segundo plano.
type fakeChunkRepository struct {
	mu     sync.Mutex
	chunks map[string][]domain.Chunk
}

var _ domain.ChunkRepository = (*fakeChunkRepository)(nil)

func newFakeChunkRepository() *fakeChunkRepository {
	return &fakeChunkRepository{chunks: map[string][]domain.Chunk{}}
}

func (f *fakeChunkRepository) ReplacePostChunks(_ context.Context, postID string, chunks []domain.Chunk) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.chunks[postID] = slices.Clone(chunks)

	return nil
}

func (f *fakeChunkRepository) DeletePostChunks(_ context.Context, postID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	delete(f.chunks, postID)

	return nil
}

func (f *fakeChunkRepository) ListByModel(_ context.Context, model string) ([]domain.Chunk, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var result []domain.Chunk
	for _, chunks := range f.chunks {
		for _, chunk := range chunks {
			if chunk.Model == model {
				result = append(result, chunk)
			}
		}
	}

	return result, nil
}

func (f *fakeChunkRepository) IndexState(ctx context.Context, postID string) (domain.PostIndexState, error) {
	states, _ := f.IndexStates(ctx)
	for _, state := range states {
		if state.PostID == postID {
			return state, nil
		}
	}

	return domain.PostIndexState{}, domain.ErrNotFound
}

func (f *fakeChunkRepository) IndexStates(_ context.Context) ([]domain.PostIndexState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var states []domain.PostIndexState
	for postID, chunks := range f.chunks {
		if len(chunks) == 0 {
			continue
		}

		states = append(states, domain.PostIndexState{PostID: postID, ContentHash: chunks[0].ContentHash, Model: chunks[0].Model, Chunks: len(chunks)})
	}

	return states, nil
}

func (f *fakeChunkRepository) chunksOf(postID string) []domain.Chunk {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.chunks[postID])
}

type ragFixture struct {
	rag      *RAGService
	posts    *PostService
	repo     *fakePostRepository
	chunks   *fakeChunkRepository
	embedder *fakeEmbedder
	provider *fakeProvider
	logs     *bytes.Buffer
}

func newRAGFixture(t *testing.T, minScore float64) *ragFixture {
	t.Helper()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	provider := &fakeProvider{context: domain.ContextualSuggestion{Suggestion: "- Enlaza el post anterior."}}
	assistant, err := NewAssistantService(provider, time.Second, logger, time.Now)
	require.NoError(t, err)

	fixture := &ragFixture{
		repo:     newFakePostRepository(),
		chunks:   newFakeChunkRepository(),
		embedder: &fakeEmbedder{model: "embedding-test"},
		provider: provider,
		logs:     &logs,
	}

	fixture.rag, err = NewRAGService(fixture.repo, fixture.chunks, fixture.embedder, assistant, RAGConfig{
		MinScore:      minScore,
		MaxChunkChars: 800,
		EmbedTimeout:  time.Second,
		IndexTimeout:  time.Second,
	}, logger)
	require.NoError(t, err)

	fixture.posts = NewPostService(fixture.repo, func() time.Time { return testNow }, WithPostIndexer(fixture.rag))

	return fixture
}

var testNow = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

// publish crea un post publicado y espera a que se indexe.
func (f *ragFixture) publish(t *testing.T, slug, title, content string) *domain.Post {
	t.Helper()

	post, err := f.posts.Create(t.Context(), testAuthorID, PostInput{Title: title, Slug: slug, Content: content, Status: domain.PostStatusPublished})
	require.NoError(t, err)
	f.rag.Wait()

	return post
}

func TestNewRAGServiceValidatesItsConfig(t *testing.T) {
	ok := RAGConfig{MinScore: 0.5, EmbedTimeout: time.Second, IndexTimeout: time.Second}
	deps := func() (domain.PostRepository, domain.ChunkRepository, domain.Embedder, contextualAssistant) {
		return newFakePostRepository(), newFakeChunkRepository(), &fakeEmbedder{model: "m"}, NewDisabledAssistant()
	}

	posts, chunks, embedder, assistant := deps()
	_, err := NewRAGService(posts, chunks, embedder, assistant, ok, slog.Default())
	require.NoError(t, err)

	_, err = NewRAGService(posts, chunks, nil, assistant, ok, slog.Default())
	require.Error(t, err)

	bad := ok
	bad.MinScore = 1.5
	_, err = NewRAGService(posts, chunks, embedder, assistant, bad, slog.Default())
	require.Error(t, err)

	bad = ok
	bad.EmbedTimeout = 0
	_, err = NewRAGService(posts, chunks, embedder, assistant, bad, slog.Default())
	require.Error(t, err)
}

func TestDisabledRAG(t *testing.T) {
	disabled := NewDisabledRAG()

	assert.False(t, disabled.Enabled())
	disabled.PostChanged(t.Context(), "post-1")
	disabled.Wait()

	_, err := disabled.ImproveWithContext(t.Context(), "", testDraft)
	require.ErrorIs(t, err, domain.ErrRAGDisabled)

	_, err = disabled.Reindex(t.Context())
	require.ErrorIs(t, err, domain.ErrRAGDisabled)

	status, err := disabled.Status(t.Context())
	require.NoError(t, err)
	assert.False(t, status.Enabled)
}

func TestPublishingIndexesThePostBySection(t *testing.T) {
	f := newRAGFixture(t, 0.1)

	post := f.publish(t, "orquestar", "Orquestar agentes", "Intro.\n\n## Herramientas\n\nCada agente tiene herramientas.")

	chunks := f.chunks.chunksOf(post.ID)
	require.Len(t, chunks, 2)
	assert.Equal(t, "", chunks[0].Section)
	assert.Equal(t, "Herramientas", chunks[1].Section)
	assert.Equal(t, 1, chunks[1].Position)
	assert.Equal(t, "orquestar", chunks[1].Slug)
	assert.Equal(t, "embedding-test", chunks[1].Model)
	assert.Len(t, chunks[1].Embedding, domain.EmbeddingDimensions)
	assert.NotEmpty(t, chunks[1].ContentHash)

	require.Equal(t, 1, f.embedder.documentCalls())
	assert.Equal(t, "Orquestar agentes — Herramientas", f.embedder.documents[0][1].Title)
	assert.Equal(t, "Orquestar agentes", f.embedder.documents[0][0].Title)
}

func TestDraftsAreNotIndexed(t *testing.T) {
	f := newRAGFixture(t, 0.1)

	post, err := f.posts.Create(t.Context(), testAuthorID, PostInput{Title: "Borrador", Content: "Texto.", Status: domain.PostStatusDraft})
	require.NoError(t, err)
	f.rag.Wait()

	assert.Empty(t, f.chunks.chunksOf(post.ID))
	assert.Zero(t, f.embedder.documentCalls())
}

// Editar sin cambiar el contenido no vuelve a generar embeddings: el
// contentHash coincide (ADR-027, punto 5).
func TestEditingWithoutContentChangesSkipsEmbeddings(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	post := f.publish(t, "uno", "Uno", "Contenido.")

	_, err := f.posts.Update(t.Context(), post.ID, PostInput{Title: "Uno", Content: "Contenido.", Tags: []string{"go"}, Status: domain.PostStatusPublished})
	require.NoError(t, err)
	f.rag.Wait()
	assert.Equal(t, 1, f.embedder.documentCalls())

	_, err = f.posts.Update(t.Context(), post.ID, PostInput{Title: "Uno", Content: "Contenido nuevo.", Status: domain.PostStatusPublished})
	require.NoError(t, err)
	f.rag.Wait()
	assert.Equal(t, 2, f.embedder.documentCalls())
	assert.Equal(t, "Contenido nuevo.", f.chunks.chunksOf(post.ID)[0].Text)
}

func TestArchivingOrUnpublishingRemovesChunks(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	archived := f.publish(t, "uno", "Uno", "Contenido.")
	unpublished := f.publish(t, "dos", "Dos", "Contenido.")

	require.NoError(t, f.posts.Archive(t.Context(), archived.ID))
	// El fake de posts no tiene mutex: se espera a la indexación antes de
	// volver a escribir.
	f.rag.Wait()
	_, err := f.posts.Update(t.Context(), unpublished.ID, PostInput{Title: "Dos", Content: "Contenido.", Status: domain.PostStatusDraft})
	require.NoError(t, err)
	f.rag.Wait()

	assert.Empty(t, f.chunks.chunksOf(archived.ID))
	assert.Empty(t, f.chunks.chunksOf(unpublished.ID))
}

// Si fallan los embeddings, el post se guarda igual y queda pendiente.
func TestEmbeddingFailureKeepsThePostAndLeavesItPending(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	f.embedder.err = domain.ErrAssistantUnavailable

	post, err := f.posts.Create(t.Context(), testAuthorID, PostInput{Title: "Uno", Slug: "uno", Content: "Texto.", Status: domain.PostStatusPublished})
	require.NoError(t, err)
	f.rag.Wait()

	stored, err := f.repo.GetByID(t.Context(), post.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.PostStatusPublished, stored.Status)
	assert.Empty(t, f.chunks.chunksOf(post.ID))
	assert.Contains(t, f.logs.String(), "rag index post failed")
	assert.NotContains(t, f.logs.String(), "Texto.")

	status, err := f.rag.Status(t.Context())
	require.NoError(t, err)
	assert.Equal(t, RAGStatus{Enabled: true, Model: "embedding-test", PublishedPosts: 1, PendingPosts: 1}, status)
}

// Con otro modelo configurado, los fragmentos viejos no se usan en la
// búsqueda y el post vuelve a indexarse al editarlo (ADR-027, punto 6).
func TestChangingTheModelReindexesAndIgnoresOldVectors(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	post := f.publish(t, "uno", "Agentes", "Orquestar agentes con herramientas.")

	f.embedder.model = "embedding-nuevo"

	result, err := f.rag.ImproveWithContext(t.Context(), "", domain.Draft{Content: "Orquestar agentes con herramientas."})
	require.NoError(t, err)
	assert.Empty(t, result.Context, "los vectores del modelo anterior no se comparan")

	status, err := f.rag.Status(t.Context())
	require.NoError(t, err)
	assert.Equal(t, 1, status.PendingPosts)

	_, err = f.posts.Update(t.Context(), post.ID, PostInput{Title: "Agentes", Content: "Orquestar agentes con herramientas.", Status: domain.PostStatusPublished})
	require.NoError(t, err)
	f.rag.Wait()
	assert.Equal(t, "embedding-nuevo", f.chunks.chunksOf(post.ID)[0].Model)
}

func TestImproveWithContextRetrievesTheClosestPosts(t *testing.T) {
	f := newRAGFixture(t, 0.2)
	agents := f.publish(t, "orquestar-agentes", "Orquestar agentes", "Un orquestador coordina agentes con herramientas.")
	f.publish(t, "recetas", "Recetas de pan", "Harina, agua, sal y levadura.")
	current := f.publish(t, "actual", "Borrador actual", "Orquestador de agentes con herramientas propias.")

	result, err := f.rag.ImproveWithContext(t.Context(), current.ID, domain.Draft{Title: "Agentes", Content: "Cómo coordina el orquestador a los agentes y sus herramientas."})

	require.NoError(t, err)
	require.Len(t, result.Context, 1, "el post editado se excluye y el de recetas no supera el umbral")
	assert.Equal(t, agents.ID, result.Context[0].PostID)
	assert.Equal(t, "Orquestar agentes", result.Context[0].PostTitle)
	assert.Equal(t, "- Enlaza el post anterior.", result.Suggestion.Suggestion)

	require.Len(t, f.provider.chunks, 1)
	assert.Equal(t, result.Context, f.provider.chunks[0], "el prompt recibe los mismos fragmentos que se devuelven")
	assert.Equal(t, []string{"Agentes\n\nCómo coordina el orquestador a los agentes y sus herramientas."}, f.embedder.queries)
}

// Si ningún fragmento supera el umbral, la sugerencia se pide sin contexto
// (ADR-027, punto 7).
func TestImproveWithContextWithoutRelevantChunksGoesOnWithoutContext(t *testing.T) {
	f := newRAGFixture(t, 0.9)
	f.publish(t, "recetas", "Recetas", "Harina y agua.")

	result, err := f.rag.ImproveWithContext(t.Context(), "", domain.Draft{Content: "Agentes y herramientas."})

	require.NoError(t, err)
	assert.Empty(t, result.Context)
	require.Len(t, f.provider.chunks, 1)
	assert.Empty(t, f.provider.chunks[0])
}

// El modelo no puede proponer links a posts que no se recuperaron.
func TestImproveWithContextRejectsLinksToUnknownPosts(t *testing.T) {
	f := newRAGFixture(t, 0.2)
	f.publish(t, "orquestar-agentes", "Orquestar agentes", "Un orquestador coordina agentes.")
	f.provider.context = domain.ContextualSuggestion{
		Suggestion:    "Sugerencia.",
		InternalLinks: []domain.InternalLink{{Slug: "inventado", Reason: "Porque sí."}},
	}

	_, err := f.rag.ImproveWithContext(t.Context(), "", domain.Draft{Content: "El orquestador coordina agentes."})

	require.ErrorIs(t, err, domain.ErrAssistantInvalidOutput)
}

func TestImproveWithContextAcceptsLinksToRetrievedPosts(t *testing.T) {
	f := newRAGFixture(t, 0.2)
	f.publish(t, "orquestar-agentes", "Orquestar agentes", "Un orquestador coordina agentes.")
	f.provider.context = domain.ContextualSuggestion{
		Suggestion:     " Sugerencia. ",
		InternalLinks:  []domain.InternalLink{{Slug: "orquestar-agentes", Reason: " En la intro. "}},
		Contradictions: []domain.Contradiction{{Slug: "orquestar-agentes", Note: "Uno contra varios."}},
	}

	result, err := f.rag.ImproveWithContext(t.Context(), "", domain.Draft{Content: "El orquestador coordina agentes."})

	require.NoError(t, err)
	assert.Equal(t, "Sugerencia.", result.Suggestion.Suggestion)
	assert.Equal(t, []domain.InternalLink{{Slug: "orquestar-agentes", Reason: "En la intro."}}, result.Suggestion.InternalLinks)
}

func TestReindexRebuildsEveryPublishedPost(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	first := f.publish(t, "uno", "Uno", "Uno.\n\n## A\n\nDos.")
	f.publish(t, "dos", "Dos", "Tres.")

	// Un post archivado con fragmentos que quedaron de antes.
	stale := "post-viejo"
	require.NoError(t, f.chunks.ReplacePostChunks(t.Context(), stale, []domain.Chunk{{PostID: stale, Model: "embedding-test"}}))

	calls := f.embedder.documentCalls()
	result, err := f.rag.Reindex(t.Context())

	require.NoError(t, err)
	assert.Equal(t, ReindexResult{Posts: 2, Indexed: 2, Removed: 1, Chunks: 3}, result)
	assert.Equal(t, calls+2, f.embedder.documentCalls(), "reindexar regenera aunque el hash coincida")
	assert.Len(t, f.chunks.chunksOf(first.ID), 2)
	assert.Empty(t, f.chunks.chunksOf(stale))

	status, err := f.rag.Status(t.Context())
	require.NoError(t, err)
	assert.Equal(t, RAGStatus{Enabled: true, Model: "embedding-test", PublishedPosts: 2, IndexedPosts: 2, Chunks: 3}, status)
}

// Al primer fallo del proveedor el reindexado se detiene: los posts
// restantes quedan pendientes y conservan sus fragmentos anteriores.
func TestReindexStopsAtTheFirstProviderFailure(t *testing.T) {
	f := newRAGFixture(t, 0.1)
	f.publish(t, "uno", "Uno", "Uno.")
	f.publish(t, "dos", "Dos", "Dos.")
	f.publish(t, "tres", "Tres", "Tres.")

	f.embedder.failAfter = f.embedder.documentCalls() + 1
	f.embedder.err = domain.ErrAssistantUnavailable

	result, err := f.rag.Reindex(t.Context())

	require.NoError(t, err)
	assert.Equal(t, 3, result.Posts)
	assert.Equal(t, 1, result.Indexed)
	assert.Equal(t, 2, result.Pending)
	assert.Equal(t, f.embedder.failAfter+1, f.embedder.documentCalls(), "no sigue llamando con la cuota agotada")

	states, err := f.chunks.IndexStates(t.Context())
	require.NoError(t, err)
	assert.Len(t, states, 3, "ningún post pierde sus fragmentos")
	assert.Contains(t, f.logs.String(), "rag reindex stopped early")
}

func TestTopChunks(t *testing.T) {
	vector := func(values ...float32) []float32 { return values }
	chunks := []domain.Chunk{
		{PostID: "a", Slug: "a", Embedding: vector(1, 0)},
		{PostID: "b", Slug: "b", Embedding: vector(0.9, 0.1)},
		{PostID: "c", Slug: "c", Embedding: vector(0, 1)},
		{PostID: "d", Slug: "d", Embedding: vector(1, 0, 0)},
		{PostID: "e", Slug: "e", Embedding: vector(0, 0)},
		{PostID: "f", Slug: "f", Embedding: vector(0.8, 0.2)},
		{PostID: "g", Slug: "g", Embedding: vector(0.7, 0.3)},
		{PostID: "h", Slug: "h", Embedding: vector(0.6, 0.4)},
	}

	top := TopChunks(vector(1, 0), chunks, "a", 0.5, 4)

	slugs := make([]string, len(top))
	for i, chunk := range top {
		slugs[i] = chunk.Slug
	}

	// a se excluye; c no supera el umbral; d (otro tamaño) y e (nulo) no se
	// comparan; de los que quedan, los 4 mejores en orden.
	assert.Equal(t, []string{"b", "f", "g", "h"}, slugs)
	assert.InDelta(t, 0.9939, top[0].Score, 0.0001)
}

func TestTopChunksBreaksTiesBySlug(t *testing.T) {
	chunks := []domain.Chunk{
		{PostID: "z", Slug: "z", Embedding: []float32{1, 0}},
		{PostID: "a", Slug: "a", Embedding: []float32{2, 0}},
	}

	top := TopChunks([]float32{1, 0}, chunks, "", 0, 4)

	assert.Equal(t, "a", top[0].Slug)
	assert.Equal(t, "z", top[1].Slug)
}

func TestCosineRejectsMismatchedOrZeroVectors(t *testing.T) {
	_, ok := cosine([]float32{1}, []float32{1, 0})
	assert.False(t, ok)

	_, ok = cosine([]float32{0, 0}, []float32{1, 0})
	assert.False(t, ok)

	_, ok = cosine(nil, nil)
	assert.False(t, ok)
}

func TestTruncateRunesKeepsRunesWhole(t *testing.T) {
	assert.Equal(t, "ñañ", truncateRunes("ñañaña", 3))
	assert.Equal(t, "corto", truncateRunes("corto", 10))
}
