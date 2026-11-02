package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPostStatusIsValid(t *testing.T) {
	tests := []struct {
		name   string
		status PostStatus
		want   bool
	}{
		{name: "draft", status: PostStatusDraft, want: true},
		{name: "published", status: PostStatusPublished, want: true},
		{name: "archived", status: PostStatusArchived, want: true},
		{name: "empty", status: "", want: false},
		{name: "unknown", status: "deleted", want: false},
		{name: "different case", status: "Draft", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.status.IsValid())
		})
	}
}
