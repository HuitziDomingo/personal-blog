// Package service contiene los casos de uso de la API.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	adminBootstrapTimeout = 10 * time.Second

	minPasswordRunes = 12
	maxPasswordBytes = 72
)

// AdminBootstrap crea el administrador inicial cuando no hay usuarios.
type AdminBootstrap struct {
	users  domain.UserRepository
	logger *slog.Logger
}

// NewAdminBootstrap crea el caso de uso.
func NewAdminBootstrap(users domain.UserRepository, logger *slog.Logger) *AdminBootstrap {
	return &AdminBootstrap{users: users, logger: logger}
}

// Run crea el administrador si la colección está vacía y hay credenciales. Con
// usuarios existentes ignora las credenciales, sin validarlas. Sin credenciales
// solo avisa, porque el blog público funciona sin administrador.
func (b *AdminBootstrap) Run(ctx context.Context, email, password string) error {
	ctx, cancel := context.WithTimeout(ctx, adminBootstrapTimeout)
	defer cancel()

	total, err := b.users.Count(ctx)
	if err != nil {
		return fmt.Errorf("count users: %w", err)
	}

	if total > 0 {
		// Con usuarios, las credenciales iniciales no hacen nada. Cambiar la
		// contraseña aquí no cambia la del admin, y el login fallaría sin pista.
		if email != "" || password != "" {
			b.logger.WarnContext(ctx, "users already exist: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are ignored and do not change any password; remove them from the environment")
		}

		return nil
	}

	if email == "" || password == "" {
		b.logger.WarnContext(ctx, "no users and no initial admin: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD")

		return nil
	}

	user, err := newAdminUser(email, password)
	if err != nil {
		return err
	}

	err = b.users.Create(ctx, user)
	if errors.Is(err, domain.ErrDuplicateEmail) {
		b.logger.InfoContext(ctx, "initial admin already created by another instance")

		return nil
	}

	if err != nil {
		return fmt.Errorf("create initial admin: %w", err)
	}

	b.logger.InfoContext(ctx, "initial admin created")

	return nil
}

func newAdminUser(email, password string) (*domain.User, error) {
	email = normalizeEmail(email)
	if !isValidEmail(email) {
		return nil, fmt.Errorf("INITIAL_ADMIN_EMAIL is not a valid address: %w", domain.ErrInvalidInput)
	}

	if err := validatePassword(password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash initial admin password: %w", err)
	}

	now := time.Now().UTC()

	return &domain.User{
		Email:        email,
		PasswordHash: string(hash),
		Role:         domain.UserRoleAdmin,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// normalizeEmail da la forma en que se guarda y se busca un email. El índice
// único de MongoDB distingue mayúsculas.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// isValidEmail rechaza también la forma "Nombre <email>", que ParseAddress acepta.
func isValidEmail(email string) bool {
	address, err := mail.ParseAddress(email)

	return err == nil && address.Address == email
}

func validatePassword(password string) error {
	if utf8.RuneCountInString(password) < minPasswordRunes {
		return fmt.Errorf("INITIAL_ADMIN_PASSWORD must have at least %d characters: %w", minPasswordRunes, domain.ErrInvalidInput)
	}

	if len(password) > maxPasswordBytes {
		return fmt.Errorf("INITIAL_ADMIN_PASSWORD must have at most %d bytes: %w", maxPasswordBytes, domain.ErrInvalidInput)
	}

	return nil
}
