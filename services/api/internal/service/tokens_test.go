package service

import (
	"context"
	"encoding/base64"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

var testSecret = []byte("0123456789abcdef0123456789abcdef")

// fakeRefreshTokens guarda los tokens en memoria con la semántica del puerto.
// rotateErr y beforeRotate permiten simular fallos y carreras.
type fakeRefreshTokens struct {
	mu           sync.Mutex
	tokens       map[string]*domain.RefreshToken // por hash
	nextID       int
	rotateErr    error
	beforeRotate func()
}

func newFakeRefreshTokens() *fakeRefreshTokens {
	return &fakeRefreshTokens{tokens: map[string]*domain.RefreshToken{}}
}

func (f *fakeRefreshTokens) Create(_ context.Context, token *domain.RefreshToken) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.insert(token)

	return nil
}

func (f *fakeRefreshTokens) insert(token *domain.RefreshToken) {
	f.nextID++
	token.ID = "token-" + strconv.Itoa(f.nextID)
	stored := *token
	f.tokens[token.TokenHash] = &stored
}

func (f *fakeRefreshTokens) GetByHash(_ context.Context, tokenHash string) (*domain.RefreshToken, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	token, ok := f.tokens[tokenHash]
	if !ok {
		return nil, domain.ErrNotFound
	}

	copied := *token

	return &copied, nil
}

func (f *fakeRefreshTokens) Rotate(_ context.Context, oldHash string, next *domain.RefreshToken, now time.Time) error {
	if f.beforeRotate != nil {
		f.beforeRotate()
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	if f.rotateErr != nil {
		return f.rotateErr
	}

	old, ok := f.tokens[oldHash]
	if !ok || old.IsRevoked() || !now.Before(old.ExpiresAt) {
		return domain.ErrInvalidToken
	}

	f.insert(next)
	old.RevokedAt = &now
	old.ReplacedBy = next.ID

	return nil
}

func (f *fakeRefreshTokens) RevokeFamily(_ context.Context, familyID string, now time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	for _, token := range f.tokens {
		if token.FamilyID == familyID && !token.IsRevoked() {
			token.RevokedAt = &now
		}
	}

	return nil
}

// activeInFamily cuenta los tokens vigentes de una familia.
func (f *fakeRefreshTokens) activeInFamily(familyID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()

	active := 0
	for _, token := range f.tokens {
		if token.FamilyID == familyID && !token.IsRevoked() {
			active++
		}
	}

	return active
}

// fakeUsersByID solo implementa GetByID.
type fakeUsersByID struct {
	domain.UserRepository

	users map[string]*domain.User
}

func (f fakeUsersByID) GetByID(_ context.Context, id string) (*domain.User, error) {
	user, ok := f.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}

	return user, nil
}

// testClock es un reloj que los tests adelantan a mano.
type testClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *testClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.now = c.now.Add(d)
}

type tokenFixture struct {
	service *TokenService
	tokens  *fakeRefreshTokens
	clock   *testClock
	user    *domain.User
}

func newTokenFixture(t *testing.T) tokenFixture {
	t.Helper()

	user := &domain.User{ID: "user-1", Email: validEmail, Role: domain.UserRoleAdmin}
	tokens := newFakeRefreshTokens()
	clock := &testClock{now: time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)}
	users := fakeUsersByID{users: map[string]*domain.User{user.ID: user}}

	service, err := NewTokenService(testSecret, tokens, users, clock.Now)
	require.NoError(t, err)

	return tokenFixture{service: service, tokens: tokens, clock: clock, user: user}
}

// signClaims firma claims arbitrarios con el método y el secreto indicados.
func signClaims(t *testing.T, method jwt.SigningMethod, secret any, claims jwt.Claims) string {
	t.Helper()

	token, err := jwt.NewWithClaims(method, claims).SignedString(secret)
	require.NoError(t, err)

	return token
}

func validClaims(now time.Time) jwt.MapClaims {
	return jwt.MapClaims{
		"sub":  "user-1",
		"role": "admin",
		"iss":  claimIssuer,
		"aud":  claimAudience,
		"iat":  now.Unix(),
		"exp":  now.Add(AccessTokenTTL).Unix(),
	}
}

func TestNewTokenServiceRejectsShortSecret(t *testing.T) {
	_, err := NewTokenService(testSecret[:MinJWTSecretBytes-1], newFakeRefreshTokens(), fakeUsersByID{}, time.Now)

	require.ErrorIs(t, err, errShortSecret)
}

func TestIssueAccessRoundTrip(t *testing.T) {
	f := newTokenFixture(t)

	token, err := f.service.IssueAccess(f.user)
	require.NoError(t, err)

	claims, err := f.service.ParseAccess(token)
	require.NoError(t, err)
	assert.Equal(t, AccessClaims{UserID: "user-1", Role: domain.UserRoleAdmin}, claims)
}

func TestIssueAccessSetsRegisteredClaims(t *testing.T) {
	f := newTokenFixture(t)

	token, err := f.service.IssueAccess(f.user)
	require.NoError(t, err)

	claims := jwt.MapClaims{}
	_, _, err = jwt.NewParser().ParseUnverified(token, claims)
	require.NoError(t, err)

	now := f.clock.Now()
	assert.Equal(t, "HS256", mustHeader(t, token)["alg"])
	assert.Equal(t, "user-1", claims["sub"])
	assert.Equal(t, "admin", claims["role"])
	assert.Equal(t, claimIssuer, claims["iss"])
	assert.Equal(t, []any{claimAudience}, claims["aud"])
	assert.InDelta(t, now.Unix(), claims["iat"], 0)
	assert.InDelta(t, now.Add(15*time.Minute).Unix(), claims["exp"], 0)
	assert.NotContains(t, claims, "email")
}

func mustHeader(t *testing.T, token string) map[string]any {
	t.Helper()

	parsed, _, err := jwt.NewParser().ParseUnverified(token, jwt.MapClaims{})
	require.NoError(t, err)

	return parsed.Header
}

func TestParseAccessRejectsInvalidTokens(t *testing.T) {
	f := newTokenFixture(t)
	now := f.clock.Now()

	without := func(key string) jwt.MapClaims {
		claims := validClaims(now)
		delete(claims, key)

		return claims
	}

	with := func(key string, value any) jwt.MapClaims {
		claims := validClaims(now)
		claims[key] = value

		return claims
	}

	tests := []struct {
		name  string
		token string
	}{
		{name: "alg none", token: signClaims(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, validClaims(now))},
		{name: "HS512", token: signClaims(t, jwt.SigningMethodHS512, testSecret, validClaims(now))},
		{name: "HS384", token: signClaims(t, jwt.SigningMethodHS384, testSecret, validClaims(now))},
		{name: "other secret", token: signClaims(t, jwt.SigningMethodHS256, []byte("another-secret-of-at-least-32-bytes!"), validClaims(now))},
		{name: "without exp", token: signClaims(t, jwt.SigningMethodHS256, testSecret, without("exp"))},
		{name: "expired", token: signClaims(t, jwt.SigningMethodHS256, testSecret, with("exp", now.Add(-time.Second).Unix()))},
		{name: "issued in the future", token: signClaims(t, jwt.SigningMethodHS256, testSecret, with("iat", now.Add(time.Minute).Unix()))},
		{name: "wrong issuer", token: signClaims(t, jwt.SigningMethodHS256, testSecret, with("iss", "evil.example/api"))},
		{name: "without issuer", token: signClaims(t, jwt.SigningMethodHS256, testSecret, without("iss"))},
		{name: "wrong audience", token: signClaims(t, jwt.SigningMethodHS256, testSecret, with("aud", "huitzi.xyz/web"))},
		{name: "without audience", token: signClaims(t, jwt.SigningMethodHS256, testSecret, without("aud"))},
		{name: "without subject", token: signClaims(t, jwt.SigningMethodHS256, testSecret, without("sub"))},
		{name: "unknown role", token: signClaims(t, jwt.SigningMethodHS256, testSecret, with("role", "editor"))},
		{name: "malformed", token: "not-a-jwt"},
		{name: "empty", token: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims, err := f.service.ParseAccess(tt.token)

			require.ErrorIs(t, err, domain.ErrInvalidToken)
			assert.Zero(t, claims)
		})
	}
}

func TestParseAccessExpiresAfterTTL(t *testing.T) {
	f := newTokenFixture(t)
	token, err := f.service.IssueAccess(f.user)
	require.NoError(t, err)

	f.clock.Advance(AccessTokenTTL - time.Second)
	_, err = f.service.ParseAccess(token)
	require.NoError(t, err)

	f.clock.Advance(time.Second)
	_, err = f.service.ParseAccess(token)
	require.ErrorIs(t, err, domain.ErrInvalidToken)
}

func TestStartSessionStoresOnlyTheHash(t *testing.T) {
	f := newTokenFixture(t)

	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)

	decoded, err := base64.RawURLEncoding.DecodeString(session.RefreshToken)
	require.NoError(t, err)
	assert.Len(t, decoded, 32)
	assert.Len(t, session.RefreshToken, 43)

	stored, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(session.RefreshToken))
	require.NoError(t, err)
	assert.Equal(t, "user-1", stored.UserID)
	assert.NotEmpty(t, stored.FamilyID)
	assert.Len(t, stored.TokenHash, 64)
	assert.NotContains(t, stored.TokenHash, session.RefreshToken)
	assert.Equal(t, f.clock.Now().Add(7*24*time.Hour), stored.ExpiresAt)

	claims, err := f.service.ParseAccess(session.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)
}

func TestStartSessionUsesNewFamilyPerLogin(t *testing.T) {
	f := newTokenFixture(t)

	first, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)
	second, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)

	assert.NotEqual(t, first.RefreshToken, second.RefreshToken)

	firstToken, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(first.RefreshToken))
	require.NoError(t, err)
	secondToken, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(second.RefreshToken))
	require.NoError(t, err)
	assert.NotEqual(t, firstToken.FamilyID, secondToken.FamilyID)
}

func TestRefreshRotatesToken(t *testing.T) {
	f := newTokenFixture(t)
	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)

	f.clock.Advance(time.Hour)
	next, err := f.service.Refresh(t.Context(), session.RefreshToken)
	require.NoError(t, err)

	assert.NotEqual(t, session.RefreshToken, next.RefreshToken)

	old, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(session.RefreshToken))
	require.NoError(t, err)
	assert.True(t, old.IsRevoked())

	rotated, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(next.RefreshToken))
	require.NoError(t, err)
	assert.Equal(t, old.FamilyID, rotated.FamilyID)
	assert.Equal(t, old.ReplacedBy, rotated.ID)
	assert.Equal(t, f.clock.Now().Add(RefreshTokenTTL), rotated.ExpiresAt)

	claims, err := f.service.ParseAccess(next.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)
}

func TestRefreshDetectsReuseAndRevokesFamily(t *testing.T) {
	f := newTokenFixture(t)
	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)
	other, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)

	next, err := f.service.Refresh(t.Context(), session.RefreshToken)
	require.NoError(t, err)

	_, err = f.service.Refresh(t.Context(), session.RefreshToken)
	require.ErrorIs(t, err, domain.ErrTokenReused)

	// El token que recibió el usuario legítimo también queda revocado.
	_, err = f.service.Refresh(t.Context(), next.RefreshToken)
	require.ErrorIs(t, err, domain.ErrTokenReused)

	family := mustFamily(t, f, session.RefreshToken)
	assert.Zero(t, f.tokens.activeInFamily(family))

	// Las demás sesiones del usuario siguen vigentes.
	_, err = f.service.Refresh(t.Context(), other.RefreshToken)
	require.NoError(t, err)
}

func TestRefreshDetectsReuseWhenRotationLosesRace(t *testing.T) {
	f := newTokenFixture(t)
	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)

	// Otra petición rota el mismo token entre la lectura y la rotación, y deja
	// un token vigente en la familia.
	f.tokens.beforeRotate = func() {
		f.tokens.beforeRotate = nil
		_, err := f.service.Refresh(t.Context(), session.RefreshToken)
		assert.NoError(t, err)
	}

	_, err = f.service.Refresh(t.Context(), session.RefreshToken)
	require.ErrorIs(t, err, domain.ErrTokenReused)
	assert.Zero(t, f.tokens.activeInFamily(mustFamily(t, f, session.RefreshToken)))
}

func TestRefreshRejectsUnusableTokens(t *testing.T) {
	tests := []struct {
		name  string
		setup func(f tokenFixture) string
	}{
		{name: "unknown", setup: func(tokenFixture) string { return "unknown-token" }},
		{name: "empty", setup: func(tokenFixture) string { return "" }},
		{name: "expired", setup: func(f tokenFixture) string {
			session, err := f.service.StartSession(t.Context(), f.user)
			require.NoError(t, err)
			f.clock.Advance(RefreshTokenTTL)

			return session.RefreshToken
		}},
		{name: "deleted user", setup: func(f tokenFixture) string {
			session, err := f.service.StartSession(t.Context(), &domain.User{ID: "deleted", Role: domain.UserRoleAdmin})
			require.NoError(t, err)

			return session.RefreshToken
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newTokenFixture(t)
			raw := tt.setup(f)

			session, err := f.service.Refresh(t.Context(), raw)

			require.ErrorIs(t, err, domain.ErrInvalidToken)
			assert.Zero(t, session)
		})
	}
}

func TestRefreshPropagatesRepositoryErrors(t *testing.T) {
	f := newTokenFixture(t)
	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)
	f.tokens.rotateErr = errDatabase

	_, err = f.service.Refresh(t.Context(), session.RefreshToken)

	require.ErrorIs(t, err, errDatabase)
	require.NotErrorIs(t, err, domain.ErrInvalidToken)
}

func TestEndSessionRevokesFamily(t *testing.T) {
	f := newTokenFixture(t)
	session, err := f.service.StartSession(t.Context(), f.user)
	require.NoError(t, err)
	next, err := f.service.Refresh(t.Context(), session.RefreshToken)
	require.NoError(t, err)

	require.NoError(t, f.service.EndSession(t.Context(), next.RefreshToken))

	assert.Zero(t, f.tokens.activeInFamily(mustFamily(t, f, session.RefreshToken)))
}

func TestEndSessionIgnoresUnknownTokens(t *testing.T) {
	f := newTokenFixture(t)

	require.NoError(t, f.service.EndSession(t.Context(), ""))
	require.NoError(t, f.service.EndSession(t.Context(), "unknown-token"))
}

func mustFamily(t *testing.T, f tokenFixture, raw string) string {
	t.Helper()

	token, err := f.tokens.GetByHash(t.Context(), hashRefreshToken(raw))
	require.NoError(t, err)

	return token.FamilyID
}
