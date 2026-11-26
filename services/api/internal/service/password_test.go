package service

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const newPassword = "otra-frase-mas-larga" //nolint:gosec // Contraseña de prueba.

type passwordFixture struct {
	auth    *AuthService
	reset   *PasswordReset
	users   fakeUsersByID
	refresh *fakeRefreshTokens
	clock   *testClock
	logs    *bytes.Buffer
}

func newPasswordFixture(t *testing.T) passwordFixture {
	t.Helper()

	users := usersWithAdmin(t)
	refresh := newFakeRefreshTokens()
	clock := &testClock{now: time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)}

	tokens, err := NewTokenService(testSecret, refresh, users, clock.Now)
	require.NoError(t, err)

	logs := &bytes.Buffer{}
	auth, err := NewAuthService(users, tokens, clock.Now, slog.New(slog.NewJSONHandler(logs, nil)))
	require.NoError(t, err)

	f := passwordFixture{
		auth:    auth,
		reset:   NewPasswordReset(users, refresh, clock.Now),
		users:   users,
		refresh: refresh,
		clock:   clock,
		logs:    logs,
	}

	// En todos los tests: el log de auditoría no lleva secretos ni el email.
	t.Cleanup(func() {
		output := logs.String()
		for _, secret := range []string{validPassword, newPassword, validEmail, f.storedHash(t)} {
			assert.NotContains(t, output, secret)
		}
	})

	return f
}

// login abre una sesión con la contraseña actual, como otro dispositivo.
func (f passwordFixture) login(t *testing.T, password string) Session {
	t.Helper()

	_, session, err := f.auth.Login(t.Context(), validEmail, password)
	require.NoError(t, err)

	return session
}

func (f passwordFixture) storedHash(t *testing.T) string {
	t.Helper()

	return f.users.users["user-1"].PasswordHash
}

func (f passwordFixture) passwordIs(t *testing.T, password string) bool {
	t.Helper()

	return bcrypt.CompareHashAndPassword([]byte(f.storedHash(t)), []byte(password)) == nil
}

func TestChangePasswordRevokesEverySessionAndOpensANewOne(t *testing.T) {
	f := newPasswordFixture(t)
	laptop := f.login(t, validPassword)
	phone := f.login(t, validPassword)

	session, err := f.auth.ChangePassword(t.Context(), "user-1", validPassword, newPassword)

	require.NoError(t, err)
	assert.True(t, f.passwordIs(t, newPassword))
	assert.True(t, strings.HasPrefix(f.storedHash(t), "$2"), "stored as a bcrypt hash")
	assert.Equal(t, f.clock.Now(), f.users.users["user-1"].UpdatedAt)

	for name, old := range map[string]Session{"laptop": laptop, "phone": phone} {
		_, err := f.auth.Refresh(t.Context(), old.RefreshToken)
		require.Error(t, err, name)
	}

	claims, err := f.auth.Authenticate(session.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)

	_, err = f.auth.Refresh(t.Context(), session.RefreshToken)
	require.NoError(t, err, "the new session works")

	_, _, err = f.auth.Login(t.Context(), validEmail, validPassword)
	require.ErrorIs(t, err, domain.ErrInvalidCredentials, "the old password no longer works")

	assert.Contains(t, f.logs.String(), `"msg":"password changed"`)
	assert.Contains(t, f.logs.String(), `"sessions_revoked":2`)
}

func TestChangePasswordRejectsAnIncorrectCurrentPassword(t *testing.T) {
	f := newPasswordFixture(t)
	before := f.storedHash(t)
	existing := f.login(t, validPassword)

	_, err := f.auth.ChangePassword(t.Context(), "user-1", "no-es-la-actual", newPassword)

	require.ErrorIs(t, err, domain.ErrIncorrectPassword)
	assert.Equal(t, before, f.storedHash(t))
	assert.Contains(t, f.logs.String(), `"reason":"incorrect_current_password"`)

	_, err = f.auth.Refresh(t.Context(), existing.RefreshToken)
	require.NoError(t, err, "a rejected change keeps the sessions")
}

func TestChangePasswordValidatesTheNewPassword(t *testing.T) {
	tests := []struct {
		name string
		next string
		want error
	}{
		{name: "same as current", next: validPassword, want: domain.ErrPasswordUnchanged},
		{name: "13 characters", next: strings.Repeat("a", MinNewPasswordRunes-1), want: domain.ErrPasswordTooShort},
		// 25 caracteres, pero 75 bytes: bcrypt solo admite 72.
		{name: "over 72 bytes", next: strings.Repeat("€", 25), want: domain.ErrPasswordTooLong},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPasswordFixture(t)
			before := f.storedHash(t)

			_, err := f.auth.ChangePassword(t.Context(), "user-1", validPassword, tt.next)

			require.ErrorIs(t, err, tt.want)
			assert.Equal(t, before, f.storedHash(t))
			assert.Contains(t, f.logs.String(), "password change rejected")
		})
	}
}

func TestChangePasswordCountsCharactersNotBytes(t *testing.T) {
	f := newPasswordFixture(t)
	// 14 caracteres y 28 bytes: cumple el mínimo.
	next := strings.Repeat("ñ", MinNewPasswordRunes)

	_, err := f.auth.ChangePassword(t.Context(), "user-1", validPassword, next)

	require.NoError(t, err)
	assert.True(t, f.passwordIs(t, next))
}

func TestChangePasswordWithAnUnknownUserIsAnInvalidSession(t *testing.T) {
	f := newPasswordFixture(t)

	_, err := f.auth.ChangePassword(t.Context(), "deleted-user", validPassword, newPassword)

	require.ErrorIs(t, err, domain.ErrInvalidToken)
}

func TestChangePasswordPropagatesRepositoryErrors(t *testing.T) {
	t.Run("update", func(t *testing.T) {
		f := newPasswordFixture(t)
		f.users.updateErr = errDatabase
		auth, err := NewAuthService(f.users, mustTokens(t, f), f.clock.Now, slog.New(slog.DiscardHandler))
		require.NoError(t, err)

		_, err = auth.ChangePassword(t.Context(), "user-1", validPassword, newPassword)

		require.ErrorIs(t, err, errDatabase)
		assert.True(t, f.passwordIs(t, validPassword))
	})

	t.Run("revoke", func(t *testing.T) {
		f := newPasswordFixture(t)
		f.refresh.revokeAllErr = errDatabase

		_, err := f.auth.ChangePassword(t.Context(), "user-1", validPassword, newPassword)

		require.ErrorIs(t, err, errDatabase)
		assert.Contains(t, f.logs.String(), "password changed but sessions were not revoked")
	})
}

func mustTokens(t *testing.T, f passwordFixture) *TokenService {
	t.Helper()

	tokens, err := NewTokenService(testSecret, f.refresh, f.users, f.clock.Now)
	require.NoError(t, err)

	return tokens
}

func TestPasswordResetDryRunChangesNothing(t *testing.T) {
	f := newPasswordFixture(t)
	existing := f.login(t, validPassword)
	before := f.storedHash(t)

	result, err := f.reset.Reset(t.Context(), "  Admin@Huitzi.XYZ ", newPassword, true)

	require.NoError(t, err)
	assert.Equal(t, ResetResult{UserID: "user-1"}, result)
	assert.Equal(t, before, f.storedHash(t))

	_, err = f.auth.Refresh(t.Context(), existing.RefreshToken)
	require.NoError(t, err)
}

func TestPasswordResetChangesThePasswordAndRevokesSessions(t *testing.T) {
	f := newPasswordFixture(t)
	existing := f.login(t, validPassword)

	result, err := f.reset.Reset(t.Context(), validEmail, newPassword, false)

	require.NoError(t, err)
	assert.Equal(t, ResetResult{UserID: "user-1", SessionsRevoked: 1}, result)
	assert.True(t, f.passwordIs(t, newPassword))

	_, err = f.auth.Refresh(t.Context(), existing.RefreshToken)
	require.Error(t, err)
}

func TestPasswordResetRejects(t *testing.T) {
	tests := []struct {
		name  string
		email string
		next  string
		want  error
	}{
		{name: "unknown email", email: "otro@huitzi.xyz", next: newPassword, want: domain.ErrNotFound},
		{name: "same as current", email: validEmail, next: validPassword, want: domain.ErrPasswordUnchanged},
		{name: "too short", email: validEmail, next: "corta", want: domain.ErrPasswordTooShort},
		{name: "too long", email: validEmail, next: strings.Repeat("x", 73), want: domain.ErrPasswordTooLong},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPasswordFixture(t)
			before := f.storedHash(t)

			_, err := f.reset.Reset(t.Context(), tt.email, tt.next, false)

			require.ErrorIs(t, err, tt.want)
			assert.Equal(t, before, f.storedHash(t))
		})
	}
}
