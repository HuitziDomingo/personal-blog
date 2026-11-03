package domain

import (
	"context"
	"time"
)

// RefreshToken es un token de refresco emitido a un usuario. Solo se guarda su
// hash: el valor en claro sale de la API una vez, en la cookie.
type RefreshToken struct {
	ID        string
	UserID    string
	FamilyID  string // Todos los tokens rotados desde un mismo login.
	TokenHash string // SHA-256 en hexadecimal.
	ExpiresAt time.Time
	CreatedAt time.Time
	// RevokedAt es nil mientras el token está vigente.
	RevokedAt *time.Time
	// ReplacedBy es el ID del token que lo reemplazó al rotar; vacío si no rotó.
	ReplacedBy string
}

// IsRevoked indica si el token ya fue rotado o revocado.
func (t *RefreshToken) IsRevoked() bool {
	return t.RevokedAt != nil
}

// RefreshTokenRepository es el puerto de persistencia de los tokens de refresco.
type RefreshTokenRepository interface {
	// Create guarda el token y le asigna un ID nuevo.
	Create(ctx context.Context, token *RefreshToken) error
	// GetByHash devuelve ErrNotFound si no hay un token con ese hash, aunque esté
	// revocado o expirado.
	GetByHash(ctx context.Context, tokenHash string) (*RefreshToken, error)
	// Rotate revoca el token vigente con oldHash y guarda next en su lugar, con
	// un ID nuevo. Es atómico respecto a otras rotaciones: si dos peticiones
	// rotan el mismo token, solo una lo consigue. Devuelve ErrInvalidToken si el
	// token no existe, ya fue revocado o expiró en now.
	Rotate(ctx context.Context, oldHash string, next *RefreshToken, now time.Time) error
	// RevokeFamily revoca en now todos los tokens vigentes de la familia.
	RevokeFamily(ctx context.Context, familyID string, now time.Time) error
}
