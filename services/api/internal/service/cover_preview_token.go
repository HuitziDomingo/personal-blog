package service

import (
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

// coverPreviewKeyLabel es el info de HKDF: separa la clave de las vistas
// previas de la de los JWT, aunque las dos salgan de JWT_SECRET, así que una
// firma de un uso nunca vale para el otro. Cambiar la etiqueta invalida todas
// las vistas previas pendientes.
const coverPreviewKeyLabel = "cover-preview-v1"

// coverPreviewKeyBytes es el largo de la clave derivada: el tamaño del bloque
// de salida de SHA-256.
const coverPreviewKeyBytes = sha256.Size

// previewSigner firma y verifica las vistas previas de portada (ADR-026, punto
// 4). La API no guarda la vista previa: el admin la reenvía al aceptarla, y la
// firma prueba que esos bytes los generó la API para ese post y ese usuario,
// sin estado en el servidor.
type previewSigner struct {
	key []byte
}

// newPreviewSigner deriva la clave de las vistas previas del secreto de la API
// con HKDF-SHA256 (RFC 5869), sin sal y con coverPreviewKeyLabel como info.
func newPreviewSigner(secret []byte) (previewSigner, error) {
	if len(secret) == 0 {
		return previewSigner{}, errors.New("cover preview signer needs a secret")
	}

	key, err := deriveCoverPreviewKey(secret)
	if err != nil {
		return previewSigner{}, err
	}

	return previewSigner{key: key}, nil
}

func deriveCoverPreviewKey(secret []byte) ([]byte, error) {
	key, err := hkdf.Key(sha256.New, secret, nil, coverPreviewKeyLabel, coverPreviewKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("derive cover preview key: %w", err)
	}

	return key, nil
}

// sign devuelve el token "<vencimiento en segundos Unix>.<HMAC en base64url>".
func (s previewSigner) sign(userID, postID string, image []byte, expiresAt time.Time) string {
	expires := strconv.FormatInt(expiresAt.Unix(), 10)

	return expires + "." + base64.RawURLEncoding.EncodeToString(s.mac(userID, postID, image, expires))
}

// verify comprueba la firma y el vencimiento. Cualquier fallo es
// domain.ErrInvalidCoverPreview, sin decir cuál: el cliente no puede hacer nada
// distinto.
func (s previewSigner) verify(token, userID, postID string, image []byte, now time.Time) error {
	expires, signature, ok := strings.Cut(token, ".")
	if !ok {
		return fmt.Errorf("%w: malformed token", domain.ErrInvalidCoverPreview)
	}

	expiresUnix, err := strconv.ParseInt(expires, 10, 64)
	if err != nil {
		return fmt.Errorf("%w: malformed expiry", domain.ErrInvalidCoverPreview)
	}

	got, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return fmt.Errorf("%w: malformed signature", domain.ErrInvalidCoverPreview)
	}

	// hmac.Equal compara en tiempo constante: el tiempo de respuesta no dice
	// cuántos bytes de la firma acertó el cliente.
	if !hmac.Equal(got, s.mac(userID, postID, image, expires)) {
		return fmt.Errorf("%w: signature mismatch", domain.ErrInvalidCoverPreview)
	}

	if !now.Before(time.Unix(expiresUnix, 0)) {
		return fmt.Errorf("%w: expired", domain.ErrInvalidCoverPreview)
	}

	return nil
}

// mac firma el usuario, el post, el hash de la imagen y el vencimiento,
// separados por un byte que ninguno contiene.
func (s previewSigner) mac(userID, postID string, image []byte, expires string) []byte {
	digest := sha256.Sum256(image)

	mac := hmac.New(sha256.New, s.key)
	for _, part := range [][]byte{[]byte(userID), []byte(postID), digest[:], []byte(expires)} {
		mac.Write(part)
		mac.Write([]byte{0})
	}

	return mac.Sum(nil)
}
