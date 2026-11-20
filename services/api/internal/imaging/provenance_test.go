package imaging

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestProvenanceMarkers(t *testing.T) {
	assert.Empty(t, ProvenanceMarkers(readFixture(t, "cover-lossy.webp")), "a plain cwebp file has no metadata")

	withC2PA := append([]byte{0xff, 0xd8, 0xff, 0xeb}, []byte("JP\x00\x00jumbjumdc2pa.claim")...)
	assert.Equal(t, []string{"C2PA (manifiesto)", "JUMBF (caja jumb)", "JUMBF (descripción jumd)"}, ProvenanceMarkers(withC2PA))

	xmp := []byte(`<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>`)
	assert.Equal(t, []string{"XMP", "IPTC DigitalSourceType", "IPTC trainedAlgorithmicMedia"}, ProvenanceMarkers(xmp))
}
