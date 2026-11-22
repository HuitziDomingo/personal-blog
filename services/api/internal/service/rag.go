package service

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strconv"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// MaxContextChunks es cuántos fragmentos se pasan como contexto como
	// mucho (ADR-027, punto 7).
	MaxContextChunks = 4

	// maxEmbeddingChars acota el texto que se convierte en embedding. El
	// modelo acepta unos 8000 tokens; un bloque de código largo o un borrador
	// de 50 000 caracteres los pasarían. Se guarda el texto completo.
	maxEmbeddingChars = 8000

	// chunkerVersion entra en el contentHash: si cambia cómo se fragmenta,
	// cambia el hash y los posts se vuelven a indexar.
	chunkerVersion = "v1"

	// reindexPageSize es el tamaño de página al recorrer los posts publicados.
	reindexPageSize = 100
)

// RAGConfig configura el RAG (ADR-027).
type RAGConfig struct {
	// MinScore es la similitud coseno mínima de un fragmento para usarlo
	// como contexto.
	MinScore float64
	// MaxChunkChars es el tamaño máximo de un fragmento.
	MaxChunkChars int
	// EmbedTimeout limita cada llamada al proveedor de embeddings.
	EmbedTimeout time.Duration
	// IndexTimeout limita la indexación en segundo plano de un post.
	IndexTimeout time.Duration
}

// RAGStatus describe el índice para el admin.
type RAGStatus struct {
	Enabled bool
	Model   string
	// PublishedPosts son los posts publicados; IndexedPosts, los que tienen
	// fragmentos al día con el modelo actual; PendingPosts, el resto.
	PublishedPosts int
	IndexedPosts   int
	PendingPosts   int
	Chunks         int
}

// ReindexResult es el resultado de reconstruir el índice.
type ReindexResult struct {
	Posts   int
	Indexed int
	// Pending son los posts que quedaron sin indexar porque el proveedor
	// falló, por ejemplo al agotar la cuota.
	Pending int
	// Removed son los posts que tenían fragmentos y ya no están publicados.
	Removed int
	Chunks  int
}

// ContextualResult es la sugerencia con los fragmentos que se usaron.
type ContextualResult struct {
	Suggestion domain.ContextualSuggestion
	Context    []domain.ContextChunk
}

// contextualAssistant es lo que el RAG necesita del asistente: la llamada con
// timeout, validación y log de AssistantService.
type contextualAssistant interface {
	ImproveWithContext(ctx context.Context, draft domain.Draft, chunks []domain.ContextChunk) (domain.ContextualSuggestion, error)
}

// RAGService implementa el workflow de ADR-027: fragmentar, generar
// embeddings, buscar, aumentar el prompt y generar, en ese orden fijo.
type RAGService struct {
	posts     domain.PostRepository
	chunks    domain.ChunkRepository
	embedder  domain.Embedder
	assistant contextualAssistant
	config    RAGConfig
	logger    *slog.Logger

	// indexing serializa la indexación: un post a la vez y nunca durante un
	// reindexado completo. Con una sola instancia (ADR-025) basta un mutex.
	indexing sync.Mutex
	// background cuenta las indexaciones en segundo plano, para esperarlas
	// al apagar y en los tests.
	background sync.WaitGroup
}

// NewRAGService crea el RAG encendido. Todas las dependencias son
// obligatorias.
func NewRAGService(posts domain.PostRepository, chunks domain.ChunkRepository, embedder domain.Embedder, assistant contextualAssistant, config RAGConfig, logger *slog.Logger) (*RAGService, error) {
	switch {
	case posts == nil || chunks == nil || embedder == nil || assistant == nil || logger == nil:
		return nil, errors.New("rag service needs posts, chunks, embedder, assistant and logger")
	case config.EmbedTimeout <= 0 || config.IndexTimeout <= 0:
		return nil, fmt.Errorf("rag timeouts must be positive: embed %s, index %s", config.EmbedTimeout, config.IndexTimeout)
	case config.MinScore < 0 || config.MinScore > 1:
		return nil, fmt.Errorf("rag min score must be between 0 and 1: %v", config.MinScore)
	}

	if config.MaxChunkChars <= 0 {
		config.MaxChunkChars = DefaultChunkMaxChars
	}

	return &RAGService{posts: posts, chunks: chunks, embedder: embedder, assistant: assistant, config: config, logger: logger}, nil
}

// NewDisabledRAG es el RAG con RAG_ENABLED=false: las operaciones devuelven
// domain.ErrRAGDisabled y nada se indexa.
func NewDisabledRAG() *RAGService {
	return &RAGService{}
}

// Enabled indica si el RAG está encendido.
func (s *RAGService) Enabled() bool {
	return s.embedder != nil
}

// PostChanged programa la indexación del post en segundo plano: el post ya
// se guardó y no espera a los embeddings (ADR-027, punto 5). La goroutine
// vuelve a leer el post, así que, si dos cambios se cruzan, el último estado
// es el que queda indexado. Un error solo se registra: el post queda
// pendiente hasta el próximo cambio o el reindexado.
func (s *RAGService) PostChanged(_ context.Context, postID string) {
	if !s.Enabled() {
		return
	}

	// Un contexto nuevo y no uno derivado del de la petición: este se
	// cancela al responder, y con context.WithoutCancel seguiría leyendo sus
	// valores, que en Gin son de un *gin.Context que se recicla para la
	// siguiente petición.
	ctx, cancel := context.WithTimeout(context.Background(), s.config.IndexTimeout)

	s.background.Go(func() {
		defer cancel()

		s.indexing.Lock()
		defer s.indexing.Unlock()

		if _, err := s.syncPost(ctx, postID, false); err != nil {
			s.logger.Warn("rag index post failed", "post_id", postID, "reason", err.Error())
		}
	})
}

// Wait espera a que terminen las indexaciones en segundo plano.
func (s *RAGService) Wait() {
	s.background.Wait()
}

// syncPost deja el índice del post igual a su estado actual: lo indexa si
// está publicado y su contenido o el modelo cambiaron (o si force), y borra
// sus fragmentos si no está publicado. Devuelve cuántos fragmentos guardó.
func (s *RAGService) syncPost(ctx context.Context, postID string, force bool) (int, error) {
	post, err := s.posts.GetByID(ctx, postID)
	if errors.Is(err, domain.ErrNotFound) {
		return 0, s.removePost(ctx, postID)
	}

	if err != nil {
		return 0, fmt.Errorf("load post: %w", err)
	}

	if post.Status != domain.PostStatusPublished {
		return 0, s.removePost(ctx, postID)
	}

	return s.indexPost(ctx, post, force)
}

func (s *RAGService) removePost(ctx context.Context, postID string) error {
	if err := s.chunks.DeletePostChunks(ctx, postID); err != nil {
		return fmt.Errorf("delete post chunks: %w", err)
	}

	return nil
}

// indexPost genera los embeddings del post y reemplaza sus fragmentos. Si el
// contentHash y el modelo coinciden con lo guardado, no hace nada salvo con
// force.
func (s *RAGService) indexPost(ctx context.Context, post *domain.Post, force bool) (int, error) {
	hash := s.contentHash(post)
	model := s.embedder.Model()

	if !force {
		state, err := s.chunks.IndexState(ctx, post.ID)
		switch {
		case err == nil && state.ContentHash == hash && state.Model == model:
			return state.Chunks, nil
		case err != nil && !errors.Is(err, domain.ErrNotFound):
			return 0, fmt.Errorf("load index state: %w", err)
		}
	}

	pieces := SplitMarkdown(post.Content, s.config.MaxChunkChars)
	if len(pieces) == 0 {
		return 0, s.removePost(ctx, post.ID)
	}

	documents := make([]domain.EmbeddingDocument, len(pieces))
	for i, piece := range pieces {
		title := post.Title
		if piece.Section != "" {
			title += " — " + piece.Section
		}

		documents[i] = domain.EmbeddingDocument{Title: title, Text: truncateRunes(piece.Text, maxEmbeddingChars)}
	}

	vectors, err := s.embedDocuments(ctx, documents)
	if err != nil {
		return 0, err
	}

	chunks := make([]domain.Chunk, len(pieces))
	for i, piece := range pieces {
		chunks[i] = domain.Chunk{
			PostID:      post.ID,
			Slug:        post.Slug,
			PostTitle:   post.Title,
			Section:     piece.Section,
			Position:    i,
			Text:        piece.Text,
			Embedding:   vectors[i],
			Model:       model,
			ContentHash: hash,
		}
	}

	if err := s.chunks.ReplacePostChunks(ctx, post.ID, chunks); err != nil {
		return 0, fmt.Errorf("save post chunks: %w", err)
	}

	s.logger.Info("rag post indexed", "post_id", post.ID, "chunks", len(chunks), "model", model)

	return len(chunks), nil
}

// embedDocuments llama al proveedor con timeout y comprueba que devuelva un
// vector de EmbeddingDimensions por documento.
func (s *RAGService) embedDocuments(ctx context.Context, documents []domain.EmbeddingDocument) ([][]float32, error) {
	ctx, cancel := context.WithTimeout(ctx, s.config.EmbedTimeout)
	defer cancel()

	vectors, err := s.embedder.EmbedDocuments(ctx, documents)
	if err != nil {
		return nil, fmt.Errorf("embed documents: %w", err)
	}

	if len(vectors) != len(documents) {
		return nil, fmt.Errorf("embed documents: %w: got %d vectors for %d documents", domain.ErrAssistantInvalidOutput, len(vectors), len(documents))
	}

	for _, vector := range vectors {
		if len(vector) != domain.EmbeddingDimensions {
			return nil, fmt.Errorf("embed documents: %w: vector has %d dimensions", domain.ErrAssistantInvalidOutput, len(vector))
		}
	}

	return vectors, nil
}

// contentHash identifica lo que se indexa de un post: título, slug,
// contenido, tamaño de fragmento y versión del divisor. El \x00 separa los
// campos para que «ab»+«c» no dé el mismo hash que «a»+«bc».
func (s *RAGService) contentHash(post *domain.Post) string {
	sum := sha256.New()
	for _, part := range []string{chunkerVersion, strconv.Itoa(s.config.MaxChunkChars), post.Title, post.Slug, post.Content} {
		sum.Write([]byte(part))
		sum.Write([]byte{0})
	}

	return hex.EncodeToString(sum.Sum(nil))
}

// Reindex reconstruye el índice (ADR-027, punto 5): vuelve a indexar cada
// post publicado y borra los fragmentos de los que ya no lo están. Cada post
// se reemplaza solo si sus embeddings se generaron, así que un fallo a la
// mitad deja el índice anterior de los posts restantes. Al primer fallo del
// proveedor se detiene: si se agotó la cuota, las siguientes llamadas también
// fallarían (punto 10). Esos posts quedan pendientes.
func (s *RAGService) Reindex(ctx context.Context) (ReindexResult, error) {
	if !s.Enabled() {
		return ReindexResult{}, domain.ErrRAGDisabled
	}

	s.indexing.Lock()
	defer s.indexing.Unlock()

	published, err := s.publishedPosts(ctx)
	if err != nil {
		return ReindexResult{}, fmt.Errorf("reindex: %w", err)
	}

	result := ReindexResult{Posts: len(published)}

	var providerErr error
	for _, post := range published {
		if providerErr != nil {
			result.Pending++

			continue
		}

		chunks, err := s.indexPost(ctx, post, true)
		switch {
		case err == nil:
			result.Indexed++
			result.Chunks += chunks
		case errors.Is(err, domain.ErrAssistantUnavailable) || errors.Is(err, domain.ErrAssistantInvalidOutput):
			providerErr = err
			result.Pending++
		default:
			return result, fmt.Errorf("reindex: %w", err)
		}
	}

	removed, err := s.removeUnpublished(ctx, published)
	if err != nil {
		return result, fmt.Errorf("reindex: %w", err)
	}

	result.Removed = removed

	attrs := []any{"posts", result.Posts, "indexed", result.Indexed, "pending", result.Pending, "removed", result.Removed, "chunks", result.Chunks}
	if providerErr != nil {
		s.logger.Warn("rag reindex stopped early", append(attrs, "reason", providerErr.Error())...)
	} else {
		s.logger.Info("rag reindex finished", attrs...)
	}

	return result, nil
}

// publishedPosts recorre todos los posts publicados, página a página.
func (s *RAGService) publishedPosts(ctx context.Context) ([]*domain.Post, error) {
	var posts []*domain.Post

	for offset := 0; ; offset += reindexPageSize {
		page, total, err := s.posts.List(ctx, domain.PostFilter{
			Status: domain.PostStatusPublished,
			Order:  domain.PostOrderPublishedDesc,
			Limit:  reindexPageSize,
			Offset: offset,
		})
		if err != nil {
			return nil, fmt.Errorf("list published posts: %w", err)
		}

		posts = append(posts, page...)
		if len(page) < reindexPageSize || int64(len(posts)) >= total {
			return posts, nil
		}
	}
}

// removeUnpublished borra los fragmentos de los posts que ya no están
// publicados, por ejemplo si se archivaron mientras el RAG estaba apagado.
func (s *RAGService) removeUnpublished(ctx context.Context, published []*domain.Post) (int, error) {
	states, err := s.chunks.IndexStates(ctx)
	if err != nil {
		return 0, fmt.Errorf("load index states: %w", err)
	}

	keep := make(map[string]struct{}, len(published))
	for _, post := range published {
		keep[post.ID] = struct{}{}
	}

	removed := 0
	for _, state := range states {
		if _, ok := keep[state.PostID]; ok {
			continue
		}

		if err := s.removePost(ctx, state.PostID); err != nil {
			return removed, err
		}

		removed++
	}

	return removed, nil
}

// Status cuenta los posts publicados, los indexados al día y los pendientes.
func (s *RAGService) Status(ctx context.Context) (RAGStatus, error) {
	if !s.Enabled() {
		return RAGStatus{}, nil
	}

	published, err := s.publishedPosts(ctx)
	if err != nil {
		return RAGStatus{}, fmt.Errorf("rag status: %w", err)
	}

	states, err := s.chunks.IndexStates(ctx)
	if err != nil {
		return RAGStatus{}, fmt.Errorf("rag status: %w", err)
	}

	byPost := make(map[string]domain.PostIndexState, len(states))
	for _, state := range states {
		byPost[state.PostID] = state
	}

	model := s.embedder.Model()
	status := RAGStatus{Enabled: true, Model: model, PublishedPosts: len(published)}

	for _, post := range published {
		state, ok := byPost[post.ID]
		if ok && state.Model == model && state.ContentHash == s.contentHash(post) {
			status.IndexedPosts++
			status.Chunks += state.Chunks
		} else {
			status.PendingPosts++
		}
	}

	return status, nil
}

// ImproveWithContext es el workflow completo (ADR-027, punto 1): el borrador
// se convierte en embedding de consulta, se buscan los fragmentos más
// parecidos de otros posts y se pide la sugerencia con ellos. Si ninguno
// supera el umbral, la sugerencia se pide sin contexto (punto 7).
//
// excludePostID es el post que se está editando, vacío si es nuevo: sus
// propios fragmentos no son contexto.
func (s *RAGService) ImproveWithContext(ctx context.Context, excludePostID string, draft domain.Draft) (ContextualResult, error) {
	if !s.Enabled() {
		return ContextualResult{}, domain.ErrRAGDisabled
	}

	query, err := s.embedQuery(ctx, draft)
	if err != nil {
		return ContextualResult{}, fmt.Errorf("improve with context: %w", err)
	}

	stored, err := s.chunks.ListByModel(ctx, s.embedder.Model())
	if err != nil {
		return ContextualResult{}, fmt.Errorf("improve with context: load chunks: %w", err)
	}

	retrieved := TopChunks(query, stored, excludePostID, s.config.MinScore, MaxContextChunks)

	s.logger.Info("rag context retrieved", "candidates", len(stored), "used", len(retrieved), "model", s.embedder.Model())

	suggestion, err := s.assistant.ImproveWithContext(ctx, draft, retrieved)
	if err != nil {
		return ContextualResult{}, fmt.Errorf("improve with context: %w", err)
	}

	return ContextualResult{Suggestion: suggestion, Context: retrieved}, nil
}

func (s *RAGService) embedQuery(ctx context.Context, draft domain.Draft) ([]float32, error) {
	ctx, cancel := context.WithTimeout(ctx, s.config.EmbedTimeout)
	defer cancel()

	text := draft.Content
	if draft.Title != "" {
		text = draft.Title + "\n\n" + draft.Content
	}

	vector, err := s.embedder.EmbedQuery(ctx, truncateRunes(text, maxEmbeddingChars))
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	if len(vector) != domain.EmbeddingDimensions {
		return nil, fmt.Errorf("embed query: %w: vector has %d dimensions", domain.ErrAssistantInvalidOutput, len(vector))
	}

	return vector, nil
}

// TopChunks devuelve los limit fragmentos más parecidos a query que superan
// minScore, sin los de excludePostID, del más parecido al menos. Recorre
// todos los fragmentos en memoria (ADR-027, punto 7): con menos de 1000 posts
// son unos milisegundos.
func TopChunks(query []float32, chunks []domain.Chunk, excludePostID string, minScore float64, limit int) []domain.ContextChunk {
	var candidates []domain.ContextChunk

	for _, chunk := range chunks {
		if chunk.PostID == excludePostID && excludePostID != "" {
			continue
		}

		score, ok := cosine(query, chunk.Embedding)
		if !ok || score < minScore {
			continue
		}

		candidates = append(candidates, domain.ContextChunk{
			PostID:    chunk.PostID,
			Slug:      chunk.Slug,
			PostTitle: chunk.PostTitle,
			Section:   chunk.Section,
			Text:      chunk.Text,
			Score:     score,
		})
	}

	// Empates: el orden de los posts es estable para que los tests y el set
	// de evaluación den siempre lo mismo.
	slices.SortStableFunc(candidates, func(a, b domain.ContextChunk) int {
		return cmp.Or(cmp.Compare(b.Score, a.Score), cmp.Compare(a.Slug, b.Slug))
	})

	if len(candidates) > limit {
		candidates = candidates[:limit]
	}

	return candidates
}

// cosine es la similitud coseno. ok es false si los vectores no se pueden
// comparar: tamaños distintos o un vector nulo.
func cosine(a, b []float32) (float64, bool) {
	if len(a) != len(b) || len(a) == 0 {
		return 0, false
	}

	var dot, normA, normB float64
	for i := range a {
		x, y := float64(a[i]), float64(b[i])
		dot += x * y
		normA += x * x
		normB += y * y
	}

	if normA == 0 || normB == 0 {
		return 0, false
	}

	return dot / (math.Sqrt(normA) * math.Sqrt(normB)), true
}

// truncateRunes corta text a max caracteres sin partir una runa.
func truncateRunes(text string, limit int) string {
	if utf8.RuneCountInString(text) <= limit {
		return text
	}

	return string([]rune(text)[:limit])
}
