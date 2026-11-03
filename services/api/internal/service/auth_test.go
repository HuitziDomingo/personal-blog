package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

func (f fakeUsersByID) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	if f.err != nil {
		return nil, f.err
	}

	for _, user := range f.users {
		if user.Email == email {
			return user, nil
		}
	}

	return nil, domain.ErrNotFound
}

type authFixture struct {
	service *AuthService
	tokens  *TokenService
	clock   *testClock
}

func newAuthFixture(t *testing.T, users fakeUsersByID) authFixture {
	t.Helper()

	clock := &testClock{now: time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)}
	tokens, err := NewTokenService(testSecret, newFakeRefreshTokens(), users, clock.Now)
	require.NoError(t, err)

	service, err := NewAuthService(users, tokens, clock.Now)
	require.NoError(t, err)

	return authFixture{service: service, tokens: tokens, clock: clock}
}

// usersWithAdmin guarda un admin con validPassword. Usa el costo mínimo de
// bcrypt para que los tests sean rápidos.
func usersWithAdmin(t *testing.T) fakeUsersByID {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(validPassword), bcrypt.MinCost)
	require.NoError(t, err)

	admin := &domain.User{ID: "user-1", Email: validEmail, PasswordHash: string(hash), Role: domain.UserRoleAdmin}

	return fakeUsersByID{users: map[string]*domain.User{admin.ID: admin}}
}

func TestLoginOpensSession(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	user, session, err := f.service.Login(t.Context(), "  Admin@Huitzi.XYZ ", validPassword)

	require.NoError(t, err)
	assert.Equal(t, "user-1", user.ID)

	claims, err := f.service.Authenticate(session.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, AccessClaims{UserID: "user-1", Role: domain.UserRoleAdmin}, claims)

	_, err = f.service.Refresh(t.Context(), session.RefreshToken)
	require.NoError(t, err)
}

func TestLoginRejectsWrongCredentialsWithTheSameError(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	tests := []struct {
		name     string
		email    string
		password string
	}{
		{name: "unknown email", email: "nobody@huitzi.xyz", password: validPassword},
		{name: "wrong password", email: validEmail, password: "wrong-password"},
		{name: "empty password", email: validEmail, password: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user, session, err := f.service.Login(t.Context(), tt.email, tt.password)

			require.ErrorIs(t, err, domain.ErrInvalidCredentials)
			assert.Equal(t, domain.ErrInvalidCredentials, err, "no wrapping that could reveal which case it was")
			assert.Nil(t, user)
			assert.Zero(t, session)
		})
	}
}

func TestLoginComparesAgainstDummyHash(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	cost, err := bcrypt.Cost(f.service.dummyHash)

	require.NoError(t, err)
	assert.Equal(t, bcrypt.DefaultCost, cost, "same cost as real password hashes")
}

func TestLoginBlocksEmailAfterTooManyFailures(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	for range MaxLoginFailures {
		_, _, err := f.service.Login(t.Context(), validEmail, "wrong-password")
		require.ErrorIs(t, err, domain.ErrInvalidCredentials)
		f.clock.Advance(time.Minute)
	}

	// El sexto intento se rechaza aunque la contraseña sea correcta.
	_, _, err := f.service.Login(t.Context(), " ADMIN@huitzi.xyz", validPassword)

	var tooMany *TooManyAttemptsError
	require.ErrorAs(t, err, &tooMany)
	require.ErrorIs(t, err, domain.ErrTooManyAttempts)
	assert.Equal(t, LoginFailureWindow-5*time.Minute, tooMany.RetryAfter)

	// Otro email no se ve afectado.
	_, _, err = f.service.Login(t.Context(), "other@huitzi.xyz", validPassword)
	require.ErrorIs(t, err, domain.ErrInvalidCredentials)

	// Al salir el primer fallo de la ventana, vuelve a haber un intento.
	f.clock.Advance(tooMany.RetryAfter)
	_, _, err = f.service.Login(t.Context(), validEmail, validPassword)
	require.NoError(t, err)
}

func TestLoginCountsUnknownEmails(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	for range MaxLoginFailures {
		_, _, err := f.service.Login(t.Context(), "nobody@huitzi.xyz", "x")
		require.ErrorIs(t, err, domain.ErrInvalidCredentials)
	}

	_, _, err := f.service.Login(t.Context(), "nobody@huitzi.xyz", "x")
	require.ErrorIs(t, err, domain.ErrTooManyAttempts)
}

func TestLoginSuccessResetsFailures(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	for range MaxLoginFailures - 1 {
		_, _, err := f.service.Login(t.Context(), validEmail, "wrong-password")
		require.ErrorIs(t, err, domain.ErrInvalidCredentials)
	}

	_, _, err := f.service.Login(t.Context(), validEmail, validPassword)
	require.NoError(t, err)

	for range MaxLoginFailures {
		_, _, err := f.service.Login(t.Context(), validEmail, "wrong-password")
		require.ErrorIs(t, err, domain.ErrInvalidCredentials)
	}

	_, _, err = f.service.Login(t.Context(), validEmail, validPassword)
	require.ErrorIs(t, err, domain.ErrTooManyAttempts)
}

func TestLoginPropagatesRepositoryErrors(t *testing.T) {
	users := usersWithAdmin(t)
	users.err = errDatabase
	f := newAuthFixture(t, users)

	_, _, err := f.service.Login(t.Context(), validEmail, validPassword)

	require.ErrorIs(t, err, errDatabase)
	require.NotErrorIs(t, err, domain.ErrInvalidCredentials)
	assert.NotContains(t, err.Error(), validEmail)
}

func TestCurrentUser(t *testing.T) {
	f := newAuthFixture(t, usersWithAdmin(t))

	user, err := f.service.CurrentUser(t.Context(), "user-1")
	require.NoError(t, err)
	assert.Equal(t, validEmail, user.Email)

	_, err = f.service.CurrentUser(t.Context(), "deleted")
	require.ErrorIs(t, err, domain.ErrInvalidToken)
}

func TestLoginAttemptsForgetOldFailures(t *testing.T) {
	clock := &testClock{now: time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)}
	attempts := newLoginAttempts(clock.Now)

	attempts.fail("a@huitzi.xyz")
	attempts.fail("b@huitzi.xyz")
	require.Equal(t, 2, attempts.size())

	clock.Advance(LoginFailureWindow)
	_, blocked := attempts.blocked("c@huitzi.xyz")

	assert.False(t, blocked)
	assert.Zero(t, attempts.size(), "the sweep removes emails without recent failures")
}
