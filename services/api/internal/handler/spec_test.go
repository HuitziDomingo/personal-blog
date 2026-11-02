package handler

import (
	"context"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadSpecReturnsEmbeddedContract(t *testing.T) {
	spec, err := LoadSpec(context.Background())

	require.NoError(t, err)
	assert.NotNil(t, spec.Paths.Find("/api/v1/auth/login"))
}

func TestValidateSpecReturnsErrorForInvalidContract(t *testing.T) {
	err := validateSpec(context.Background(), &openapi3.T{})

	require.ErrorContains(t, err, "validate openapi spec")
}
