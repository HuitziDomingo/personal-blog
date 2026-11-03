package domain

import "errors"

// Errores estándar del dominio. Los repositorios y services los devuelven
// (directamente o envueltos con %w) y las capas externas los identifican con
// errors.Is para traducirlos a su propio protocolo.
var (
	ErrNotFound           = errors.New("resource not found")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrInvalidInput       = errors.New("invalid input")
	ErrDuplicateEmail     = errors.New("email already exists")
	ErrDuplicateSlug      = errors.New("slug already exists")

	// ErrTokenReused indica que llegó un refresh token ya rotado o revocado:
	// alguien más tiene una copia, así que se revoca toda su familia.
	ErrTokenReused = errors.New("refresh token reused")

	// ErrTooManyAttempts indica que un email agotó sus logins fallidos.
	ErrTooManyAttempts = errors.New("too many login attempts")
)
