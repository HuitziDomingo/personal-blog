// Command cover-sample genera UNA portada real con FLUX.1 [schnell] en
// Cloudflare Workers AI y describe lo que devolvió el proveedor: formato,
// resolución, tamaño y metadatos de procedencia o de IA (C2PA/JUMBF, XMP,
// IPTC). Sirve para decidir el formato de las portadas (ADR-026, punto 8)
// antes de activarlas. Gasta una imagen de la cuota gratuita de Cloudflare;
// no llama a Gemini ni guarda nada en la base.
//
// Se corre a mano con make api-cover-sample, que lee .env. Nunca en CI.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/images/cloudflare"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/imaging"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

// sampleSubject es un tema fijo y neutro: la muestra no depende de Gemini.
const sampleSubject = "agents passing messages along a pipeline of connected nodes"

const timeout = 60 * time.Second

func main() {
	outDir := flag.String("out", "", "directorio donde guardar la imagen")
	flag.Parse()

	if err := run(*outDir); err != nil {
		fmt.Fprintln(os.Stderr, "cover-sample:", err)
		os.Exit(1)
	}
}

func run(outDir string) error {
	if outDir == "" {
		return errors.New("falta -out")
	}

	account := strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID"))
	token := os.Getenv("CLOUDFLARE_AI_TOKEN")

	if account == "" || token == "" {
		return errors.New("faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_AI_TOKEN en .env")
	}

	generator, err := cloudflare.New(cloudflare.Config{AccountID: account, Token: token})
	if err != nil {
		return fmt.Errorf("crear el generador: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	start := time.Now()

	generated, err := generator.Generate(ctx, service.CoverPrompt(sampleSubject))
	if err != nil {
		return fmt.Errorf("generar: %w", err)
	}

	elapsed := time.Since(start)

	report, path, err := describe(generated.Data, outDir)
	if err != nil {
		return err
	}

	fmt.Printf("modelo:      %s\nlatencia:    %s\narchivo:     %s\n%s", generated.Model, elapsed.Round(time.Millisecond), path, report)

	return nil
}

// describe guarda la imagen con la extensión que dicta su firma y devuelve el
// informe. Una imagen que no pasa imaging.Inspect se guarda igual, como .bin,
// para poder revisarla.
func describe(data []byte, outDir string) (string, string, error) {
	var report strings.Builder

	extension := "bin"

	info, inspectErr := imaging.Inspect(data)
	if inspectErr == nil {
		extension = info.Extension
		fmt.Fprintf(&report, "formato:     %s (%s)\nresolución:  %d × %d\n", info.Name, info.ContentType, info.Width, info.Height)
	} else {
		fmt.Fprintf(&report, "formato:     no aceptado por imaging.Inspect: %v\n", inspectErr)
	}

	fmt.Fprintf(&report, "tamaño:      %d bytes (%.1f KiB)\n", len(data), float64(len(data))/1024)

	markers := imaging.ProvenanceMarkers(data)
	if len(markers) == 0 {
		fmt.Fprintf(&report, "metadatos:   ninguno de C2PA/JUMBF, XMP, IPTC, EXIF ni texto PNG\n")
	} else {
		fmt.Fprintf(&report, "metadatos:   %s\n", strings.Join(markers, ", "))
	}

	if inspectErr == nil {
		blur, err := imaging.BlurDataURL(data)
		if err != nil {
			fmt.Fprintf(&report, "blur:        falló: %v\n", err)
		} else {
			fmt.Fprintf(&report, "blur:        %d caracteres\n", len(blur))
		}
	}

	if err := os.MkdirAll(outDir, 0o750); err != nil {
		return "", "", fmt.Errorf("crear %s: %w", outDir, err)
	}

	digest := sha256.Sum256(data)
	path := filepath.Join(outDir, "portada-muestra-"+hex.EncodeToString(digest[:6])+"."+extension)

	// El nombre sale del hash y la extensión de la firma; el directorio lo pasa
	// quien corre el comando a mano.
	if err := os.WriteFile(path, data, 0o600); err != nil { //nolint:gosec // Ruta elegida por el operador local.
		return "", "", fmt.Errorf("guardar la imagen: %w", err)
	}

	return report.String(), path, nil
}
