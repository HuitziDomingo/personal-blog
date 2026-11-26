package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	mongooptions "go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const (
	adminEmail      = "admin@huitzi.xyz"
	currentPassword = "correct-horse-battery"
	newPassword     = "otra-frase-mas-larga" //nolint:gosec // Contraseña de prueba.
)

// answers responde a cada pregunta con el siguiente valor; sin valores, falla.
type answers struct {
	values  []string
	prompts []string
}

func (a *answers) ReadSecret(prompt string) (string, error) {
	a.prompts = append(a.prompts, prompt)
	if len(a.values) == 0 {
		return "", errors.New("no more input")
	}

	value := a.values[0]
	a.values = a.values[1:]

	return value, nil
}

func TestRunValidatesBeforeAskingAnything(t *testing.T) {
	tests := []struct {
		name string
		opts options
		want string
	}{
		{name: "without uri", opts: options{db: "personal_blog"}, want: "TARGET_MONGO_URI"},
		{name: "without db", opts: options{uri: "mongodb://127.0.0.1:1"}, want: "-db"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := &answers{}

			err := run(t.Context(), tt.opts, input, &bytes.Buffer{})

			require.ErrorContains(t, err, tt.want)
			assert.Empty(t, input.prompts)
		})
	}
}

func TestRunRejectsBadInputBeforeConnecting(t *testing.T) {
	tests := []struct {
		name   string
		values []string
		want   string
	}{
		{name: "empty email", values: []string{"  "}, want: "email está vacío"},
		{name: "confirmation differs", values: []string{adminEmail, newPassword, newPassword + "x"}, want: "no coinciden"},
		{name: "input ends", values: []string{adminEmail}, want: "leer la contraseña"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Un puerto cerrado: si llegara a conectar, el error sería otro.
			opts := options{uri: "mongodb://127.0.0.1:1", db: "personal_blog", dryRun: true}

			err := run(t.Context(), opts, &answers{values: tt.values}, &bytes.Buffer{})

			require.ErrorContains(t, err, tt.want)
			assert.NotContains(t, err.Error(), newPassword)
		})
	}
}

func TestRedactRemovesTheURI(t *testing.T) {
	uri := "mongodb+srv://user:secret@cluster.example.net" //nolint:gosec // URI de prueba, no real.

	assert.Equal(t, "connect <uri>: refused", redact("connect "+uri+": refused", uri))
	assert.Equal(t, "plain", redact("plain", ""))
}

// testDatabase crea una base propia con un admin y una sesión vigente, y la
// borra al terminar. Se salta si no hay MongoDB.
func testDatabase(t *testing.T) (options, *mongodb.Client, string) {
	t.Helper()

	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("MONGO_TEST_URI is not set")
	}

	db := "test_" + bson.NewObjectID().Hex()
	client, err := mongodb.Connect(t.Context(), uri, db)
	require.NoError(t, err)
	require.NoError(t, client.EnsureIndexes(t.Context()))

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		assert.NoError(t, client.Disconnect(ctx))

		// El cliente del repositorio no expone Drop: la base se borra con el
		// driver directamente.
		raw, err := mongo.Connect(mongooptions.Client().ApplyURI(uri))
		if assert.NoError(t, err) {
			assert.NoError(t, raw.Database(db).Drop(ctx))
			assert.NoError(t, raw.Disconnect(ctx))
		}
	})

	hash, err := bcrypt.GenerateFromPassword([]byte(currentPassword), bcrypt.MinCost)
	require.NoError(t, err)

	now := time.Now().UTC()
	admin := &domain.User{Email: adminEmail, PasswordHash: string(hash), Role: domain.UserRoleAdmin, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, mongodb.NewUserRepository(client).Create(t.Context(), admin))

	require.NoError(t, mongodb.NewRefreshTokenRepository(client).Create(t.Context(), &domain.RefreshToken{
		UserID: admin.ID, FamilyID: "family-a", TokenHash: "hash-a", ExpiresAt: now.Add(time.Hour), CreatedAt: now,
	}))

	return options{uri: uri, db: db}, client, admin.ID
}

func storedPassword(t *testing.T, client *mongodb.Client, password string) bool {
	t.Helper()

	user, err := mongodb.NewUserRepository(client).GetByEmail(t.Context(), adminEmail)
	require.NoError(t, err)

	return bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) == nil
}

func sessionRevoked(t *testing.T, client *mongodb.Client) bool {
	t.Helper()

	token, err := mongodb.NewRefreshTokenRepository(client).GetByHash(t.Context(), "hash-a")
	require.NoError(t, err)

	return token.IsRevoked()
}

func TestRunDryRunByDefaultChangesNothing(t *testing.T) {
	opts, client, userID := testDatabase(t)
	opts.dryRun = true
	var out bytes.Buffer

	err := run(t.Context(), opts, &answers{values: []string{"  Admin@Huitzi.XYZ ", newPassword, newPassword}}, &out)

	require.NoError(t, err)
	assert.Contains(t, out.String(), "Simulacro")
	assert.Contains(t, out.String(), userID)
	assert.True(t, storedPassword(t, client, currentPassword))
	assert.False(t, sessionRevoked(t, client))
	assertNoSecrets(t, out.String(), opts.uri)
}

func TestRunResetsThePasswordAndRevokesSessions(t *testing.T) {
	opts, client, userID := testDatabase(t)
	var out bytes.Buffer

	err := run(t.Context(), opts, &answers{values: []string{adminEmail, newPassword, newPassword}}, &out)

	require.NoError(t, err)
	assert.Contains(t, out.String(), "Contraseña cambiada para el usuario "+userID)
	assert.Contains(t, out.String(), "Refresh tokens revocados: 1")
	assert.True(t, storedPassword(t, client, newPassword))
	assert.True(t, sessionRevoked(t, client))
	assertNoSecrets(t, out.String(), opts.uri)
}

func TestRunExplainsRejections(t *testing.T) {
	tests := []struct {
		name   string
		values []string
		want   string
	}{
		{name: "unknown email", values: []string{"otro@huitzi.xyz", newPassword, newPassword}, want: "no hay ningún usuario"},
		{name: "same as current", values: []string{adminEmail, currentPassword, currentPassword}, want: "igual a la actual"},
		{name: "too short", values: []string{adminEmail, "corta", "corta"}, want: "al menos 14 caracteres"},
		{name: "too long", values: []string{adminEmail, strings.Repeat("x", 73), strings.Repeat("x", 73)}, want: "72 bytes"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts, client, _ := testDatabase(t)

			err := run(t.Context(), opts, &answers{values: tt.values}, &bytes.Buffer{})

			require.ErrorContains(t, err, tt.want)
			assert.True(t, storedPassword(t, client, currentPassword))
			assert.False(t, sessionRevoked(t, client))
		})
	}
}

func assertNoSecrets(t *testing.T, output, uri string) {
	t.Helper()

	for _, secret := range []string{newPassword, currentPassword, adminEmail, uri} {
		assert.NotContains(t, output, secret)
	}
}
