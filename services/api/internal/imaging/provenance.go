package imaging

import "bytes"

// provenanceMarkers son cadenas que delatan metadatos de procedencia o de IA
// dentro de los bytes de una imagen. Es una búsqueda literal, no un parser:
// sirve para saber si hace falta mirar más, no para validar una firma C2PA.
var provenanceMarkers = []struct {
	name   string
	marker []byte
}{
	{"C2PA (manifiesto)", []byte("c2pa")},
	{"JUMBF (caja jumb)", []byte("jumb")},
	{"JUMBF (descripción jumd)", []byte("jumd")},
	{"XMP", []byte("<x:xmpmeta")},
	{"IPTC DigitalSourceType", []byte("DigitalSourceType")},
	{"IPTC trainedAlgorithmicMedia", []byte("trainedAlgorithmicMedia")},
	{"IPTC compositeWithTrainedAlgorithmicMedia", []byte("compositeWithTrainedAlgorithmicMedia")},
	{"EXIF", []byte("Exif\x00\x00")},
	{"PNG tEXt", []byte("tEXt")},
	{"PNG iTXt", []byte("iTXt")},
	{"WebP EXIF", []byte("EXIF")},
	{"WebP XMP", []byte("XMP ")},
}

// ProvenanceMarkers devuelve los nombres de los marcadores de procedencia o de
// IA que aparecen en data, en el orden de provenanceMarkers.
func ProvenanceMarkers(data []byte) []string {
	var found []string

	for _, m := range provenanceMarkers {
		if bytes.Contains(data, m.marker) {
			found = append(found, m.name)
		}
	}

	return found
}
