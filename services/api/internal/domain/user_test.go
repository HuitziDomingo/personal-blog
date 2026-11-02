package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUserRoleIsValid(t *testing.T) {
	tests := []struct {
		name string
		role UserRole
		want bool
	}{
		{name: "admin", role: UserRoleAdmin, want: true},
		{name: "empty", role: "", want: false},
		{name: "unknown", role: "editor", want: false},
		{name: "different case", role: "ADMIN", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.role.IsValid())
		})
	}
}
