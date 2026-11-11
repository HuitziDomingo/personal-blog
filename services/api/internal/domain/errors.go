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

	// ErrSlugLocked indica que se intentó cambiar el slug de un post que ya
	// se publicó alguna vez: cambiarlo rompería sus links.
	ErrSlugLocked = errors.New("slug cannot change once the post has been published")

	// ErrTokenReused indica que llegó un refresh token ya rotado o revocado:
	// alguien más tiene una copia, así que se revoca toda su familia.
	ErrTokenReused = errors.New("refresh token reused")

	// ErrTooManyAttempts indica que un email agotó sus logins fallidos.
	ErrTooManyAttempts = errors.New("too many login attempts")

	// ErrInvalidComment indica un nombre o contenido que no cumple las reglas
	// de un comentario, como uno con solo espacios.
	ErrInvalidComment = errors.New("invalid comment")

	// ErrInvalidParent indica que el comentario al que se responde no existe,
	// es de otro post, no está aprobado o ya es una respuesta: hay un solo
	// nivel de respuestas (ADR-022).
	ErrInvalidParent = errors.New("parent must be an approved top-level comment of the same post")
)
