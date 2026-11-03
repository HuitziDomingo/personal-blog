package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const (
	// AccessTokenTTL es la vigencia del JWT de acceso.
	AccessTokenTTL = 15 * time.Minute
	// RefreshTokenTTL es la vigencia de cada refresh token, contada desde que se
	// emite.
	RefreshTokenTTL = 7 * 24 * time.Hour
	// MinJWTSecretBytes es el tamaño mínimo del secreto de firma (ADR-010).
	MinJWTSecretBytes = 32

	claimIssuer       = "huitzi.xyz/api"
	claimAudience     = "huitzi.xyz/admin"
	refreshTokenBytes = 32
)

// errShortSecret indica que el secreto de firma es demasiado corto.
var errShortSecret = fmt.Errorf("jwt secret must be at least %d bytes", MinJWTSecretBytes)

// AccessClaims son los datos de un JWT de acceso válido.
type AccessClaims struct {
	UserID string
	Role   domain.UserRole
}

// Session son los tokens en claro de una sesión. Solo existen en la respuesta
// que los entrega; la API guarda únicamente el hash del refresh token.
type Session struct {
	AccessToken  string
	RefreshToken string
}

// accessClaims es el cuerpo del JWT de acceso.
type accessClaims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// TokenService emite y valida los tokens de sesión.
type TokenService struct {
	secret        []byte
	refreshTokens domain.RefreshTokenRepository
	users         domain.UserRepository
	now           func() time.Time
	parser        *jwt.Parser
}

// NewTokenService crea el service. Devuelve un error si el secreto tiene menos
// de MinJWTSecretBytes bytes.
func NewTokenService(
	secret []byte,
	refreshTokens domain.RefreshTokenRepository,
	users domain.UserRepository,
	now func() time.Time,
) (*TokenService, error) {
	if len(secret) < MinJWTSecretBytes {
		return nil, errShortSecret
	}

	return &TokenService{
		secret:        secret,
		refreshTokens: refreshTokens,
		users:         users,
		now:           now,
		// Opciones de ADR-011. WithTimeFunc solo cambia el reloj, para los tests.
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithExpirationRequired(),
			jwt.WithIssuedAt(),
			jwt.WithIssuer(claimIssuer),
			jwt.WithAudience(claimAudience),
			jwt.WithTimeFunc(now),
		),
	}, nil
}

// IssueAccess firma un JWT de acceso para el usuario.
func (s *TokenService) IssueAccess(user *domain.User) (string, error) {
	now := s.now()
	claims := accessClaims{
		Role: string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			Issuer:    claimIssuer,
			Audience:  jwt.ClaimStrings{claimAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("sign access token: %w", err)
	}

	return token, nil
}

// ParseAccess valida un JWT de acceso. Cualquier fallo devuelve
// domain.ErrInvalidToken, sin el motivo: el cliente no debe distinguirlos.
func (s *TokenService) ParseAccess(token string) (AccessClaims, error) {
	var claims accessClaims

	_, err := s.parser.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) {
		return s.secret, nil
	})
	if err != nil {
		return AccessClaims{}, domain.ErrInvalidToken
	}

	role := domain.UserRole(claims.Role)
	if claims.Subject == "" || !role.IsValid() {
		return AccessClaims{}, domain.ErrInvalidToken
	}

	return AccessClaims{UserID: claims.Subject, Role: role}, nil
}

// StartSession abre una sesión nueva tras un login: un JWT de acceso y el
// primer refresh token de una familia nueva.
func (s *TokenService) StartSession(ctx context.Context, user *domain.User) (Session, error) {
	refresh, token, err := s.newRefreshToken(user.ID, rand.Text())
	if err != nil {
		return Session{}, err
	}

	if err := s.refreshTokens.Create(ctx, token); err != nil {
		return Session{}, fmt.Errorf("start session: %w", err)
	}

	access, err := s.IssueAccess(user)
	if err != nil {
		return Session{}, err
	}

	return Session{AccessToken: access, RefreshToken: refresh}, nil
}

// Refresh cambia un refresh token vigente por una sesión nueva de la misma
// familia. Si el token ya fue rotado o revocado, revoca toda la familia y
// devuelve domain.ErrTokenReused. Si no existe o expiró, devuelve
// domain.ErrInvalidToken.
func (s *TokenService) Refresh(ctx context.Context, raw string) (Session, error) {
	oldHash := hashRefreshToken(raw)

	current, err := s.findRefreshToken(ctx, oldHash)
	if err != nil {
		return Session{}, err
	}

	if current.IsRevoked() {
		return Session{}, s.revokeReused(ctx, current.FamilyID)
	}

	if !s.now().Before(current.ExpiresAt) {
		return Session{}, domain.ErrInvalidToken
	}

	user, err := s.users.GetByID(ctx, current.UserID)
	if errors.Is(err, domain.ErrNotFound) {
		return Session{}, domain.ErrInvalidToken
	}

	if err != nil {
		return Session{}, fmt.Errorf("refresh session: %w", err)
	}

	refresh, next, err := s.newRefreshToken(user.ID, current.FamilyID)
	if err != nil {
		return Session{}, err
	}

	if err := s.refreshTokens.Rotate(ctx, oldHash, next, s.now()); err != nil {
		return Session{}, s.rotateFailed(ctx, oldHash, err)
	}

	access, err := s.IssueAccess(user)
	if err != nil {
		return Session{}, err
	}

	return Session{AccessToken: access, RefreshToken: refresh}, nil
}

// EndSession revoca la familia del refresh token. Un token desconocido no es
// un error: el logout siempre termina bien.
func (s *TokenService) EndSession(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}

	current, err := s.findRefreshToken(ctx, hashRefreshToken(raw))
	if errors.Is(err, domain.ErrInvalidToken) {
		return nil
	}

	if err != nil {
		return err
	}

	if err := s.refreshTokens.RevokeFamily(ctx, current.FamilyID, s.now()); err != nil {
		return fmt.Errorf("end session: %w", err)
	}

	return nil
}

// findRefreshToken traduce un hash desconocido a domain.ErrInvalidToken.
func (s *TokenService) findRefreshToken(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	token, err := s.refreshTokens.GetByHash(ctx, tokenHash)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.ErrInvalidToken
	}

	if err != nil {
		return nil, fmt.Errorf("find refresh token: %w", err)
	}

	return token, nil
}

// rotateFailed clasifica un Rotate rechazado. Entre la lectura y la rotación
// otra petición pudo rotar el mismo token: eso también es reuso.
func (s *TokenService) rotateFailed(ctx context.Context, oldHash string, err error) error {
	if !errors.Is(err, domain.ErrInvalidToken) {
		return fmt.Errorf("rotate refresh token: %w", err)
	}

	current, err := s.findRefreshToken(ctx, oldHash)
	if err != nil {
		return err
	}

	if current.IsRevoked() {
		return s.revokeReused(ctx, current.FamilyID)
	}

	return domain.ErrInvalidToken
}

// revokeReused revoca la familia de un token reusado y devuelve
// domain.ErrTokenReused.
func (s *TokenService) revokeReused(ctx context.Context, familyID string) error {
	if err := s.refreshTokens.RevokeFamily(ctx, familyID, s.now()); err != nil {
		return fmt.Errorf("revoke reused family: %w", err)
	}

	return domain.ErrTokenReused
}

// newRefreshToken genera un refresh token en claro y el registro que se guarda,
// que solo lleva su hash.
func (s *TokenService) newRefreshToken(userID, familyID string) (string, *domain.RefreshToken, error) {
	buf := make([]byte, refreshTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", nil, fmt.Errorf("generate refresh token: %w", err)
	}

	raw := base64.RawURLEncoding.EncodeToString(buf)
	now := s.now()

	return raw, &domain.RefreshToken{
		UserID:    userID,
		FamilyID:  familyID,
		TokenHash: hashRefreshToken(raw),
		ExpiresAt: now.Add(RefreshTokenTTL),
		CreatedAt: now,
	}, nil
}

// hashRefreshToken devuelve el SHA-256 del token en hexadecimal.
func hashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))

	return hex.EncodeToString(sum[:])
}
