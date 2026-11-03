package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// TooManyAttemptsError indica que el email agotó sus logins fallidos.
// errors.Is lo reconoce como domain.ErrTooManyAttempts.
type TooManyAttemptsError struct {
	RetryAfter time.Duration
}

func (e *TooManyAttemptsError) Error() string {
	return domain.ErrTooManyAttempts.Error()
}

func (e *TooManyAttemptsError) Unwrap() error {
	return domain.ErrTooManyAttempts
}

// AuthService implementa el login y la sesión del administrador.
type AuthService struct {
	users    domain.UserRepository
	tokens   *TokenService
	attempts *loginAttempts
	// dummyHash se compara cuando el email no existe, para que esa respuesta
	// tarde lo mismo que una contraseña incorrecta.
	dummyHash []byte
}

// NewAuthService crea el service. Calcula una vez el hash falso del login.
func NewAuthService(users domain.UserRepository, tokens *TokenService, now func() time.Time) (*AuthService, error) {
	dummyHash, err := bcrypt.GenerateFromPassword([]byte(rand.Text()), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash dummy password: %w", err)
	}

	return &AuthService{
		users:     users,
		tokens:    tokens,
		attempts:  newLoginAttempts(now),
		dummyHash: dummyHash,
	}, nil
}

// Login comprueba las credenciales y abre una sesión. Un email desconocido y
// una contraseña incorrecta devuelven el mismo domain.ErrInvalidCredentials.
// Tras MaxLoginFailures fallos en LoginFailureWindow devuelve
// *TooManyAttemptsError sin comprobar la contraseña.
func (s *AuthService) Login(ctx context.Context, email, password string) (*domain.User, Session, error) {
	email = normalizeEmail(email)

	if retryAfter, blocked := s.attempts.blocked(email); blocked {
		return nil, Session{}, &TooManyAttemptsError{RetryAfter: retryAfter}
	}

	user, err := s.users.GetByEmail(ctx, email)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, Session{}, fmt.Errorf("login: %w", err)
	}

	hash := s.dummyHash
	if user != nil {
		hash = []byte(user.PasswordHash)
	}

	// Se compara siempre, también con el hash falso: así no se distingue por
	// tiempo si el email existe.
	if bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil || user == nil {
		s.attempts.fail(email)

		return nil, Session{}, domain.ErrInvalidCredentials
	}

	s.attempts.reset(email)

	session, err := s.tokens.StartSession(ctx, user)
	if err != nil {
		return nil, Session{}, err
	}

	return user, session, nil
}

// Refresh rota la sesión; ver TokenService.Refresh.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (Session, error) {
	return s.tokens.Refresh(ctx, refreshToken)
}

// Logout revoca la sesión del refresh token, si existe.
func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	return s.tokens.EndSession(ctx, refreshToken)
}

// Authenticate valida un JWT de acceso; ver TokenService.ParseAccess.
func (s *AuthService) Authenticate(accessToken string) (AccessClaims, error) {
	return s.tokens.ParseAccess(accessToken)
}

// CurrentUser devuelve el usuario de una sesión. Si ya no existe, la sesión
// deja de valer: devuelve domain.ErrInvalidToken.
func (s *AuthService) CurrentUser(ctx context.Context, userID string) (*domain.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.ErrInvalidToken
	}

	if err != nil {
		return nil, fmt.Errorf("current user: %w", err)
	}

	return user, nil
}
