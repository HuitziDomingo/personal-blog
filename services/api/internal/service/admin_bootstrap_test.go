package service

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	validEmail    = "admin@huitzi.xyz"
	validPassword = "correct-horse-battery"
)

var errDatabase = errors.New("database unavailable")

// fakeUserRepository solo implementa lo que usa el bootstrap. El puerto embebido
// es nil: llamar a cualquier otro método hace fallar el test.
type fakeUserRepository struct {
	domain.UserRepository

	total     int64
	countErr  error
	createErr error
	created   []*domain.User
}

func (f *fakeUserRepository) Count(context.Context) (int64, error) {
	return f.total, f.countErr
}

func (f *fakeUserRepository) Create(_ context.Context, user *domain.User) error {
	if f.createErr != nil {
		return f.createErr
	}

	f.created = append(f.created, user)

	return nil
}

// runBootstrap ejecuta el caso de uso y comprueba en todos los tests que los
// secretos no llegan ni al log ni al error.
func runBootstrap(t *testing.T, users *fakeUserRepository, email, password string) (string, error) {
	t.Helper()

	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))

	err := NewAdminBootstrap(users, logger).Run(t.Context(), email, password)

	output := logs.String()
	if err != nil {
		output += err.Error()
	}

	if password != "" {
		assert.NotContains(t, output, password)
	}

	for _, user := range users.created {
		assert.NotContains(t, output, user.PasswordHash)
	}

	return logs.String(), err
}

func TestAdminBootstrapCreatesAdminWhenUsersIsEmpty(t *testing.T) {
	users := &fakeUserRepository{}

	logs, err := runBootstrap(t, users, "  Admin@Huitzi.XYZ ", validPassword)

	require.NoError(t, err)
	require.Len(t, users.created, 1)
	assert.Contains(t, logs, "initial admin created")

	admin := users.created[0]
	assert.Equal(t, validEmail, admin.Email)
	assert.Equal(t, domain.UserRoleAdmin, admin.Role)
	assert.False(t, admin.CreatedAt.IsZero())
	assert.Equal(t, admin.CreatedAt, admin.UpdatedAt)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(validPassword)))
}

func TestAdminBootstrapWarnsWhenCredentialsAreMissing(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		password string
	}{
		{name: "both missing"},
		{name: "password missing", email: validEmail},
		{name: "email missing", password: validPassword},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			users := &fakeUserRepository{}

			logs, err := runBootstrap(t, users, tt.email, tt.password)

			require.NoError(t, err)
			assert.Empty(t, users.created)
			assert.Contains(t, logs, "level=WARN")
			assert.Contains(t, logs, "INITIAL_ADMIN_EMAIL")
		})
	}
}

func TestAdminBootstrapIgnoresCredentialsWhenUsersExist(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		password string
	}{
		{name: "valid credentials", email: validEmail, password: validPassword},
		{name: "invalid credentials", email: "nope", password: "short"},
		{name: "no credentials"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			users := &fakeUserRepository{total: 1}

			logs, err := runBootstrap(t, users, tt.email, tt.password)

			require.NoError(t, err)
			assert.Empty(t, users.created)
			assert.Empty(t, logs)
		})
	}
}

func TestAdminBootstrapTreatsDuplicateEmailAsSuccess(t *testing.T) {
	users := &fakeUserRepository{createErr: domain.ErrDuplicateEmail}

	logs, err := runBootstrap(t, users, validEmail, validPassword)

	require.NoError(t, err)
	assert.Contains(t, logs, "another instance")
}

func TestAdminBootstrapPropagatesRepositoryErrors(t *testing.T) {
	tests := []struct {
		name  string
		users *fakeUserRepository
	}{
		{name: "count", users: &fakeUserRepository{countErr: errDatabase}},
		{name: "create", users: &fakeUserRepository{createErr: errDatabase}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := runBootstrap(t, tt.users, validEmail, validPassword)

			require.ErrorIs(t, err, errDatabase)
		})
	}
}

func TestAdminBootstrapValidatesPassword(t *testing.T) {
	const emoji = "😀" // 1 carácter, 4 bytes.

	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		{name: "11 characters", password: strings.Repeat("a", 11)},
		{name: "12 characters", password: strings.Repeat("a", 12), valid: true},
		{name: "72 bytes", password: strings.Repeat("a", 72), valid: true},
		{name: "73 bytes", password: strings.Repeat("a", 73)},
		{name: "11 multibyte characters", password: strings.Repeat(emoji, 11)},
		{name: "12 multibyte characters", password: strings.Repeat(emoji, 12), valid: true},
		{name: "19 multibyte characters are 76 bytes", password: strings.Repeat(emoji, 19)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			users := &fakeUserRepository{}

			_, err := runBootstrap(t, users, validEmail, tt.password)

			if tt.valid {
				require.NoError(t, err)
				assert.Len(t, users.created, 1)

				return
			}

			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Empty(t, users.created)
		})
	}
}

func TestAdminBootstrapRejectsInvalidEmail(t *testing.T) {
	for _, email := range []string{"not-an-email", "Admin <admin@huitzi.xyz>", "@huitzi.xyz"} {
		t.Run(email, func(t *testing.T) {
			users := &fakeUserRepository{}

			_, err := runBootstrap(t, users, email, validPassword)

			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Empty(t, users.created)
		})
	}
}
