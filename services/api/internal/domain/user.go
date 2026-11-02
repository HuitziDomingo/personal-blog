package domain

import (
	"context"
	"time"
)

// UserRole define los permisos de un usuario.
type UserRole string

// Roles válidos de un usuario.
const (
	UserRoleAdmin UserRole = "admin"
)

// IsValid indica si el rol pertenece al enum.
func (r UserRole) IsValid() bool {
	switch r {
	case UserRoleAdmin:
		return true
	default:
		return false
	}
}

// User es una cuenta con acceso al dashboard de administración.
type User struct {
	ID           string
	Email        string
	PasswordHash string // Hash bcrypt; nunca debe salir de la API.
	Role         UserRole
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// UserRepository es el puerto de persistencia de usuarios.
type UserRepository interface {
	// Create devuelve ErrDuplicateEmail si el email ya está registrado.
	Create(ctx context.Context, user *User) error
	// GetByID devuelve ErrNotFound si el usuario no existe.
	GetByID(ctx context.Context, id string) (*User, error)
	// GetByEmail devuelve ErrNotFound si el usuario no existe.
	GetByEmail(ctx context.Context, email string) (*User, error)
	// Update devuelve ErrNotFound si el usuario no existe y ErrDuplicateEmail
	// si el nuevo email ya está registrado.
	Update(ctx context.Context, user *User) error
	// Count devuelve el total de usuarios; el bootstrap del administrador
	// inicial solo se ejecuta cuando es cero.
	Count(ctx context.Context) (int64, error)
}
