package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	testCommentID = "6730f1a2b3c4d5e6f7a8b9d1"
	commentsPath  = "/api/v1/posts/hola-mundo/comments"
)

// generousWindow es el límite de comentarios de los tests que no lo prueban.
var generousWindow = WindowLimit{Max: 10000, Window: time.Minute}

var commentTestTime = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

// fakeComments simula el service de comentarios. Registra lo que recibe y
// devuelve err si está fijado.
type fakeComments struct {
	mu sync.Mutex

	err      error
	comments []*domain.Comment

	submitted   []service.CommentSubmission
	submitSlug  string
	listStatus  domain.CommentStatus
	listArgs    []int
	reviewed    []string
	replyParent string
	replyBody   string
}

func newFakeComments() *fakeComments {
	reviewedAt := commentTestTime.Add(time.Hour)

	return &fakeComments{comments: []*domain.Comment{{
		ID:       testCommentID,
		PostID:   "6730f1a2b3c4d5e6f7a8b9c0",
		Name:     "Ana",
		Content:  "<script>alert(1)</script> Buen post, `go test` me salvó.",
		Status:   domain.CommentStatusApproved,
		ByAuthor: false,
		Moderation: &domain.Moderation{
			Verdict:    domain.ModerationVerdictApprove,
			Category:   domain.ModerationCategoryNone,
			Reason:     "on topic",
			Model:      "gemini-test",
			AnalyzedAt: commentTestTime,
		},
		CreatedAt:  commentTestTime,
		ReviewedAt: &reviewedAt,
	}}}
}

func (f *fakeComments) Submit(_ context.Context, slug string, input service.CommentSubmission) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.submitSlug = slug
	f.submitted = append(f.submitted, input)

	return f.err
}

func (f *fakeComments) ListApproved(_ context.Context, slug string, limit, offset int) (service.CommentPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.submitSlug = slug
	f.listArgs = []int{limit, offset}

	return f.page()
}

func (f *fakeComments) List(_ context.Context, status domain.CommentStatus, limit, offset int) (service.CommentPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.listStatus = status
	f.listArgs = []int{limit, offset}

	return f.page()
}

func (f *fakeComments) Approve(_ context.Context, id string) (*domain.Comment, error) {
	return f.review(id)
}

func (f *fakeComments) Reject(_ context.Context, id string) (*domain.Comment, error) {
	return f.review(id)
}

func (f *fakeComments) Reply(_ context.Context, parentID, content string) (*domain.Comment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.replyParent, f.replyBody = parentID, content
	if f.err != nil {
		return nil, f.err
	}

	return &domain.Comment{
		ID: "6730f1a2b3c4d5e6f7a8b9d2", PostID: "6730f1a2b3c4d5e6f7a8b9c0", ParentID: parentID,
		Name: service.AuthorDisplayName, Content: content, Status: domain.CommentStatusApproved,
		ByAuthor: true, CreatedAt: commentTestTime,
	}, nil
}

func (f *fakeComments) review(id string) (*domain.Comment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.reviewed = append(f.reviewed, id)
	if f.err != nil {
		return nil, f.err
	}

	if id != testCommentID {
		return nil, domain.ErrNotFound
	}

	return f.comments[0], nil
}

func (f *fakeComments) page() (service.CommentPage, error) {
	if f.err != nil {
		return service.CommentPage{}, f.err
	}

	return service.CommentPage{Comments: f.comments, Total: int64(len(f.comments)), Limit: 20, Offset: 0}, nil
}

func commentsRouter(t *testing.T, comments *fakeComments) *gin.Engine {
	t.Helper()

	cfg := testRouterConfig()
	cfg.Comments = comments

	return newTestRouterWith(t, cfg)
}

func submissionBody(name, content string) string {
	return fmt.Sprintf(`{"name":%q,"content":%q}`, name, content)
}

func TestSubmitCommentIsAlwaysPending(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	body := `{"name":"Ana","content":"Hola","parentId":"6730f1a2b3c4d5e6f7a8b9d1","website":""}`
	response := send(router, http.MethodPost, commentsPath, body, nil)

	require.Equal(t, http.StatusAccepted, response.Code)
	assert.JSONEq(t, `{"status":"pending"}`, response.Body.String())
	assert.Equal(t, "hola-mundo", comments.submitSlug)
	assert.Equal(t, []service.CommentSubmission{{Name: "Ana", Content: "Hola", ParentID: testCommentID}}, comments.submitted)
}

// El campo trampa llega al service, que lo descarta; la respuesta es la misma.
func TestSubmitCommentPassesTheTrapField(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	response := send(router, http.MethodPost, commentsPath, `{"name":"Bot","content":"Compra","website":"https://spam.example"}`, nil)

	require.Equal(t, http.StatusAccepted, response.Code)
	assert.JSONEq(t, `{"status":"pending"}`, response.Body.String())
	require.Len(t, comments.submitted, 1)
	assert.Equal(t, "https://spam.example", comments.submitted[0].Trap)
}

func TestSubmitCommentErrors(t *testing.T) {
	tests := map[string]struct {
		err    error
		status int
		detail string
	}{
		"comentarios desactivados o post no publicado": {err: fmt.Errorf("submit comment: %w", domain.ErrNotFound), status: http.StatusNotFound},
		"solo espacios":              {err: fmt.Errorf("%w: name is required", domain.ErrInvalidComment), status: http.StatusBadRequest, detail: detailInvalidComment},
		"respuesta de una respuesta": {err: domain.ErrInvalidParent, status: http.StatusBadRequest, detail: detailInvalidParent},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			comments := newFakeComments()
			comments.err = tt.err
			router := commentsRouter(t, comments)

			problem := requireProblem(t, send(router, http.MethodPost, commentsPath, submissionBody("Ana", "Hola"), nil), tt.status)
			if tt.detail != "" {
				require.NotNil(t, problem.Detail)
				assert.Equal(t, tt.detail, *problem.Detail)
			}
		})
	}
}

// El validador del contrato aplica los límites antes del handler: el service
// no llega a recibir la petición.
func TestSubmitCommentLimitsFromTheContract(t *testing.T) {
	tests := map[string]struct {
		body   string
		detail string
	}{
		"nombre vacío":           {body: submissionBody("", "Hola"), detail: "name: minimum string length is 1"},
		"nombre de 51":           {body: submissionBody(strings.Repeat("ñ", 51), "Hola"), detail: "name: maximum string length is 50"},
		"contenido vacío":        {body: submissionBody("Ana", ""), detail: "content: minimum string length is 1"},
		"contenido de 2001":      {body: submissionBody("Ana", strings.Repeat("á", 2001)), detail: "content: maximum string length is 2000"},
		"sin contenido":          {body: `{"name":"Ana"}`, detail: `content: property "content" is missing`},
		"trampa demasiado larga": {body: fmt.Sprintf(`{"name":"Ana","content":"Hola","website":%q}`, strings.Repeat("a", 201)), detail: "website: maximum string length is 200"},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			comments := newFakeComments()
			cfg := testRouterConfig()
			cfg.Comments = comments
			cfg.MaxBodyBytes = 1 << 20
			router := newTestRouterWith(t, cfg)

			problem := requireProblem(t, send(router, http.MethodPost, commentsPath, tt.body, nil), http.StatusBadRequest)
			require.NotNil(t, problem.Detail)
			assert.Equal(t, tt.detail, *problem.Detail)
			assert.Empty(t, comments.submitted)
		})
	}
}

// En caracteres, no en bytes: 2000 letras con tilde son 4000 bytes y pasan.
func TestSubmitCommentLimitsCountCharacters(t *testing.T) {
	comments := newFakeComments()
	cfg := testRouterConfig()
	cfg.Comments = comments
	cfg.MaxBodyBytes = 1 << 20
	router := newTestRouterWith(t, cfg)

	response := send(router, http.MethodPost, commentsPath, submissionBody(strings.Repeat("ñ", 50), strings.Repeat("á", 2000)), nil)

	assert.Equal(t, http.StatusAccepted, response.Code)
}

func TestSubmitCommentFromAForeignOriginIsForbidden(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	response := send(router, http.MethodPost, commentsPath, submissionBody("Ana", "Hola"), map[string]string{"Origin": badOrigin})

	requireProblem(t, response, http.StatusForbidden)
	assert.Empty(t, comments.submitted)
}

// El envío tiene su propio límite por IP, además del global, aunque haya
// sesión; leer comentarios no lo gasta.
func TestSubmitCommentHasItsOwnIPLimit(t *testing.T) {
	cfg := testRouterConfig()
	cfg.Comments = newFakeComments()
	cfg.RateLimits.Comments = WindowLimit{Max: 3, Window: 10 * time.Minute}
	router := newTestRouterWith(t, cfg)

	for range 3 {
		require.Equal(t, http.StatusAccepted, send(router, http.MethodPost, commentsPath, submissionBody("Ana", "Hola"), nil).Code)
	}

	response := send(router, http.MethodPost, commentsPath, submissionBody("Ana", "Hola"), nil)
	requireProblem(t, response, http.StatusTooManyRequests)
	// Un token cada 200 s.
	assert.Equal(t, "200", response.Header().Get("Retry-After"))

	assert.Equal(t, http.StatusTooManyRequests,
		send(router, http.MethodPost, "/api/v1/posts/otro-post/comments", submissionBody("Ana", "Hola"), withAccessCookie(testAccessToken)).Code,
		"the bucket is per IP, for every post and also with a session")
	assert.Equal(t, http.StatusOK, get(router, commentsPath).Code, "reading comments does not spend it")

	other := httptest.NewRequest(http.MethodPost, commentsPath, strings.NewReader(submissionBody("Ana", "Hola")))
	other.Header.Set("Content-Type", "application/json")
	other.RemoteAddr = otherClientKey + ":1234"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, other)
	assert.Equal(t, http.StatusAccepted, recorder.Code, "each IP has its own bucket")
}

func TestIsCommentSubmission(t *testing.T) {
	assert.True(t, isCommentSubmission(http.MethodPost, "/api/v1/posts/hola/comments"))

	for _, path := range []string{"/api/v1/posts/comments", "/api/v1/posts//comments", "/api/v1/posts/a/b/comments", "/api/v1/admin/comments", "/api/v1/posts/hola/comments/x"} {
		assert.False(t, isCommentSubmission(http.MethodPost, path), path)
	}

	assert.False(t, isCommentSubmission(http.MethodGet, "/api/v1/posts/hola/comments"))
}

func TestRouterNeedsCommentsAndTheirLimit(t *testing.T) {
	spec, err := LoadSpec(t.Context())
	require.NoError(t, err)

	cfg := testRouterConfig()
	cfg.Comments = nil
	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.EqualError(t, err, "router needs comments")

	cfg = testRouterConfig()
	cfg.RateLimits.Comments = WindowLimit{Max: 3}
	_, err = NewRouter(&fakePinger{}, spec, cfg)
	require.Error(t, err)
}

// La lectura pública no lleva datos de moderación ni el estado.
func TestListPostCommentsHidesModeration(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	response := get(router, commentsPath+"?limit=5&offset=10")

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{
		"items": [{
			"id": "6730f1a2b3c4d5e6f7a8b9d1",
			"name": "Ana",
			"content": "<script>alert(1)</script> Buen post, `+"`go test`"+` me salvó.",
			"byAuthor": false,
			"createdAt": "2026-11-11T12:00:00Z"
		}],
		"total": 1,
		"limit": 20,
		"offset": 0
	}`, response.Body.String())
	assert.Equal(t, []int{5, 10}, comments.listArgs)
	assert.Equal(t, "hola-mundo", comments.submitSlug)
}

func TestListPostCommentsOfAMissingPost(t *testing.T) {
	comments := newFakeComments()
	comments.err = domain.ErrNotFound

	requireProblem(t, get(commentsRouter(t, comments), commentsPath), http.StatusNotFound)
}

func TestListCommentsForModeration(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	response := send(router, http.MethodGet, "/api/v1/admin/comments?status=pending&limit=50", "", adminSession())

	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{
		"items": [{
			"id": "6730f1a2b3c4d5e6f7a8b9d1",
			"postId": "6730f1a2b3c4d5e6f7a8b9c0",
			"name": "Ana",
			"content": "<script>alert(1)</script> Buen post, `+"`go test`"+` me salvó.",
			"status": "approved",
			"byAuthor": false,
			"moderation": {"verdict": "approve", "category": "none", "reason": "on topic", "model": "gemini-test", "analyzedAt": "2026-11-11T12:00:00Z"},
			"createdAt": "2026-11-11T12:00:00Z",
			"reviewedAt": "2026-11-11T13:00:00Z"
		}],
		"total": 1,
		"limit": 20,
		"offset": 0
	}`, response.Body.String())
	assert.Equal(t, domain.CommentStatusPending, comments.listStatus)
	assert.Equal(t, []int{50, 0}, comments.listArgs)

	requireProblem(t, send(router, http.MethodGet, "/api/v1/admin/comments?status=spam", "", adminSession()), http.StatusBadRequest)
}

func TestApproveAndRejectComment(t *testing.T) {
	for _, action := range []string{"approve", "reject"} {
		t.Run(action, func(t *testing.T) {
			comments := newFakeComments()
			router := commentsRouter(t, comments)

			response := send(router, http.MethodPost, "/api/v1/admin/comments/"+testCommentID+"/"+action, "", adminSession())
			require.Equal(t, http.StatusOK, response.Code)
			assert.Contains(t, response.Body.String(), `"id":"`+testCommentID+`"`)

			requireProblem(t, send(router, http.MethodPost, "/api/v1/admin/comments/no-existe/"+action, "", adminSession()), http.StatusNotFound)
			assert.Equal(t, []string{testCommentID, "no-existe"}, comments.reviewed)
		})
	}
}

func TestReplyToComment(t *testing.T) {
	comments := newFakeComments()
	router := commentsRouter(t, comments)

	response := send(router, http.MethodPost, "/api/v1/admin/comments/"+testCommentID+"/replies", `{"content":"Gracias, Ana."}`, adminSession())

	require.Equal(t, http.StatusCreated, response.Code)
	assert.JSONEq(t, `{
		"id": "6730f1a2b3c4d5e6f7a8b9d2",
		"postId": "6730f1a2b3c4d5e6f7a8b9c0",
		"parentId": "6730f1a2b3c4d5e6f7a8b9d1",
		"name": "Autor",
		"content": "Gracias, Ana.",
		"status": "approved",
		"byAuthor": true,
		"createdAt": "2026-11-11T12:00:00Z"
	}`, response.Body.String())
	assert.Equal(t, testCommentID, comments.replyParent)
	assert.Equal(t, "Gracias, Ana.", comments.replyBody)

	comments.err = domain.ErrInvalidParent
	problem := requireProblem(t, send(router, http.MethodPost, "/api/v1/admin/comments/"+testCommentID+"/replies", `{"content":"Otra"}`, adminSession()), http.StatusBadRequest)
	assert.Equal(t, detailInvalidParent, *problem.Detail)

	cfg := testRouterConfig()
	cfg.Comments = comments
	cfg.MaxBodyBytes = 1 << 20
	long := fmt.Sprintf(`{"content":%q}`, strings.Repeat("a", 2001))
	problem = requireProblem(t, send(newTestRouterWith(t, cfg), http.MethodPost, "/api/v1/admin/comments/"+testCommentID+"/replies", long, adminSession()), http.StatusBadRequest)
	assert.Equal(t, "content: maximum string length is 2000", *problem.Detail)
}

// Las operaciones del admin piden sesión y rol de admin.
func TestCommentModerationNeedsAnAdmin(t *testing.T) {
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/api/v1/admin/comments", ""},
		{http.MethodPost, "/api/v1/admin/comments/" + testCommentID + "/approve", ""},
		{http.MethodPost, "/api/v1/admin/comments/" + testCommentID + "/reject", ""},
		{http.MethodPost, "/api/v1/admin/comments/" + testCommentID + "/replies", `{"content":"Hola"}`},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			comments := newFakeComments()
			router := commentsRouter(t, comments)

			requireProblem(t, send(router, route.method, route.path, route.body, nil), http.StatusUnauthorized)
			requireProblem(t, send(router, route.method, route.path, route.body, withCookies(accessCookie(editorAccessToken))), http.StatusForbidden)
			assert.Empty(t, comments.reviewed)
			assert.Empty(t, comments.replyBody)
		})
	}
}
