package service

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// MinNewPasswordRunes es el largo mínimo de una contraseña nueva, en
	// caracteres (ADR-032). El bootstrap del admin inicial conserva su mínimo.
	MinNewPasswordRunes = 14

	// MaxPasswordChanges es cuántos cambios de contraseña admite un usuario
	// por PasswordChangeWindow, salgan bien o mal (ADR-032).
	MaxPasswordChanges = 5
	// PasswordChangeWindow es la ventana del límite de cambios de contraseña.
	PasswordChangeWindow = 15 * time.Minute

	// auditEvent agrupa en los logs los eventos de contraseña.
	auditEvent = "password_change"
)

// ChangePassword cambia la contraseña del usuario de la sesión. Comprueba la
// actual, guarda el hash bcrypt de la nueva, revoca todos los refresh tokens
// del usuario y abre una sesión nueva para quien la cambió (ADR-032).
func (s *AuthService) ChangePassword(ctx context.Context, userID, current, next string) (Session, error) {
	user, err := s.CurrentUser(ctx, userID)
	if err != nil {
		return Session{}, err
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(current)) != nil {
		s.auditRejected(ctx, user.ID, "incorrect_current_password")

		return Session{}, domain.ErrIncorrectPassword
	}

	if current == next {
		s.auditRejected(ctx, user.ID, "unchanged")

		return Session{}, domain.ErrPasswordUnchanged
	}

	if err := setPassword(ctx, s.users, user, next, s.now()); err != nil {
		if isPasswordRule(err) {
			s.auditRejected(ctx, user.ID, "invalid_new_password")
		}

		return Session{}, err
	}

	session, revoked, err := s.tokens.ReplaceSessions(ctx, user)
	if err != nil {
		// La contraseña ya cambió: el log lo deja claro para revocar a mano
		// con el comando de emergencia si hace falta.
		s.logger.ErrorContext(ctx, "password changed but sessions were not revoked",
			"audit", auditEvent, "user_id", user.ID, "error", err)

		return Session{}, err
	}

	s.logger.InfoContext(ctx, "password changed",
		"audit", auditEvent, "user_id", user.ID, "sessions_revoked", revoked)

	return session, nil
}

func (s *AuthService) auditRejected(ctx context.Context, userID, reason string) {
	s.logger.WarnContext(ctx, "password change rejected",
		"audit", auditEvent, "user_id", userID, "reason", reason)
}

// PasswordReset es el restablecimiento de emergencia de la contraseña, sin
// sesión ni contraseña actual: lo usa cmd/reset-admin-password (ADR-032).
type PasswordReset struct {
	users         domain.UserRepository
	refreshTokens domain.RefreshTokenRepository
	now           func() time.Time
}

// NewPasswordReset crea el caso de uso.
func NewPasswordReset(users domain.UserRepository, refreshTokens domain.RefreshTokenRepository, now func() time.Time) *PasswordReset {
	return &PasswordReset{users: users, refreshTokens: refreshTokens, now: now}
}

// ResetResult es lo que hizo, o haría en un simulacro, un restablecimiento.
type ResetResult struct {
	UserID string
	// SessionsRevoked es cero en un simulacro.
	SessionsRevoked int64
}

// Reset valida la contraseña nueva y, si dryRun es false, la guarda y revoca
// todos los refresh tokens del usuario. Un email desconocido devuelve
// domain.ErrNotFound; una contraseña igual a la actual,
// domain.ErrPasswordUnchanged.
func (r *PasswordReset) Reset(ctx context.Context, email, next string, dryRun bool) (ResetResult, error) {
	if err := validateNewPassword(next); err != nil {
		return ResetResult{}, err
	}

	user, err := r.users.GetByEmail(ctx, normalizeEmail(email))
	if err != nil {
		return ResetResult{}, fmt.Errorf("find user: %w", err)
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(next)) == nil {
		return ResetResult{}, domain.ErrPasswordUnchanged
	}

	result := ResetResult{UserID: user.ID}
	if dryRun {
		return result, nil
	}

	now := r.now()
	if err := setPassword(ctx, r.users, user, next, now); err != nil {
		return ResetResult{}, err
	}

	result.SessionsRevoked, err = r.refreshTokens.RevokeAllForUser(ctx, user.ID, now)
	if err != nil {
		return result, fmt.Errorf("password changed but sessions were not revoked: %w", err)
	}

	return result, nil
}

// setPassword valida la contraseña nueva y guarda su hash en el usuario.
func setPassword(ctx context.Context, users domain.UserRepository, user *domain.User, next string, now time.Time) error {
	if err := validateNewPassword(next); err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}

	user.PasswordHash = string(hash)
	user.UpdatedAt = now.UTC()

	if err := users.Update(ctx, user); err != nil {
		return fmt.Errorf("save new password: %w", err)
	}

	return nil
}

// validateNewPassword aplica las reglas de largo de ADR-032. El máximo es en
// bytes porque bcrypt no admite más de 72.
func validateNewPassword(password string) error {
	if utf8.RuneCountInString(password) < MinNewPasswordRunes {
		return domain.ErrPasswordTooShort
	}

	if len(password) > maxPasswordBytes {
		return domain.ErrPasswordTooLong
	}

	return nil
}

func isPasswordRule(err error) bool {
	return errors.Is(err, domain.ErrPasswordTooShort) || errors.Is(err, domain.ErrPasswordTooLong)
}
