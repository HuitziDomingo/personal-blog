// Command migrate-covers asigna su portada a los 2 posts migrados de la web
// anterior (docs/web/posts-migrados/): la imagen que ya sirve apps/web en
// /img/blog/, con su texto alternativo en español y su blurDataUrl.
//
// Es idempotente: un post que ya tiene esa portada no cambia, uno con otra
// portada no se pisa y uno que no existe se omite. Pide la URI de MongoDB, la
// base y la URL de la web de forma explícita, sin valores por defecto: nunca
// toma la de producción por accidente. La URI llega en MIGRATE_MONGO_URI, no
// como argumento, para que no aparezca en la lista de procesos; tampoco lee
// MONGO_URI de .env. Con -dry-run solo informa.
//
// Se corre a mano con make api-migrate-covers. Nunca en CI.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/imaging"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const timeout = 30 * time.Second

// migration es la portada de un post migrado.
type migration struct {
	slug  string
	image string // ruta dentro de apps/web/public
	alt   string
}

// migrations son los 2 posts de docs/web/posts-migrados/. Los dos usan la
// misma imagen, como en la web anterior.
var migrations = []migration{
	{slug: "arreglos", image: "img/blog/arreglos-portada.webp", alt: "Fragmento de código JavaScript con las funciones arrayConcat y arrayPush"},
	{slug: "backend-api", image: "img/blog/arreglos-portada.webp", alt: "Fragmento de código JavaScript con las funciones arrayConcat y arrayPush"},
}

// options son los argumentos del comando.
type options struct {
	mongoURI  string
	database  string
	siteURL   string
	publicDir string
	dryRun    bool
}

func main() {
	var opts options

	flag.StringVar(&opts.database, "db", "", "nombre de la base (obligatorio)")
	flag.StringVar(&opts.siteURL, "site-url", "", "URL de la web que sirve /img/blog/, por ejemplo http://localhost:3000 o https://huitzi.xyz (obligatoria)")
	flag.StringVar(&opts.publicDir, "public-dir", "../../apps/web/public", "directorio public/ de apps/web")
	flag.BoolVar(&opts.dryRun, "dry-run", false, "solo informar, sin escribir")
	flag.Parse()

	opts.mongoURI = os.Getenv("MIGRATE_MONGO_URI")

	if err := run(context.Background(), opts, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "migrate-covers:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, opts options, out io.Writer) error {
	siteURL, err := validate(opts)
	if err != nil {
		return err
	}

	covers, err := buildCovers(siteURL, opts.publicDir)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client, err := mongodb.Connect(ctx, opts.mongoURI, opts.database)
	if err != nil {
		// El error del driver puede incluir la URI: no se imprime.
		return errors.New("no se pudo conectar a MongoDB con MIGRATE_MONGO_URI y -db")
	}

	defer func() { _ = client.Disconnect(context.Background()) }()

	return apply(ctx, mongodb.NewPostRepository(client), covers, opts.dryRun, out)
}

// coverSetter es lo que el comando necesita del repositorio.
type coverSetter interface {
	SetCoverIfMissing(ctx context.Context, slug string, cover domain.Cover, dryRun bool) (mongodb.CoverMigrationResult, error)
}

func apply(ctx context.Context, posts coverSetter, covers map[string]domain.Cover, dryRun bool, out io.Writer) error {
	if dryRun {
		if _, err := fmt.Fprintln(out, "simulacro: no se escribe nada"); err != nil {
			return fmt.Errorf("write report: %w", err)
		}
	}

	for _, m := range migrations {
		result, err := posts.SetCoverIfMissing(ctx, m.slug, covers[m.slug], dryRun)
		if err != nil {
			return fmt.Errorf("%s: %w", m.slug, err)
		}

		if _, err := fmt.Fprintf(out, "%-12s %s\n", m.slug, describe(result, dryRun)); err != nil {
			return fmt.Errorf("write report: %w", err)
		}
	}

	return nil
}

func describe(result mongodb.CoverMigrationResult, dryRun bool) string {
	switch result {
	case mongodb.CoverSet:
		if dryRun {
			return "se le asignaría la portada"
		}

		return "portada asignada"
	case mongodb.CoverUnchanged:
		return "ya tenía esta portada: sin cambios"
	case mongodb.CoverKept:
		return "tiene otra portada: no se pisa"
	case mongodb.CoverPostMissing:
		return "no existe: se omite"
	default:
		return string(result)
	}
}

func validate(opts options) (string, error) {
	switch {
	case opts.mongoURI == "":
		return "", errors.New("falta MIGRATE_MONGO_URI: el comando no tiene URI por defecto")
	case opts.database == "":
		return "", errors.New("falta -db")
	case opts.siteURL == "":
		return "", errors.New("falta -site-url")
	}

	parsed, err := url.Parse(opts.siteURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || strings.Trim(parsed.Path, "/") != "" {
		return "", fmt.Errorf("-site-url %q debe ser solo esquema y host, por ejemplo https://huitzi.xyz", opts.siteURL)
	}

	return parsed.Scheme + "://" + parsed.Host, nil
}

// buildCovers lee cada imagen de public/ y arma su portada con el
// blurDataUrl.
func buildCovers(siteURL, publicDir string) (map[string]domain.Cover, error) {
	covers := make(map[string]domain.Cover, len(migrations))

	for _, m := range migrations {
		// Rutas fijas de migrations bajo el public/ que pasa quien corre el
		// comando a mano.
		data, err := os.ReadFile(filepath.Join(publicDir, filepath.FromSlash(m.image))) //nolint:gosec // Ruta fija bajo un directorio local.
		if err != nil {
			return nil, fmt.Errorf("leer %s: %w", m.image, err)
		}

		blur, err := imaging.BlurDataURLOf(data)
		if err != nil {
			return nil, fmt.Errorf("placeholder de %s: %w", m.image, err)
		}

		covers[m.slug] = domain.Cover{URL: siteURL + "/" + m.image, Alt: m.alt, BlurDataURL: blur}
	}

	return covers, nil
}
