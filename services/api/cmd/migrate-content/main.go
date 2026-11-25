// Command migrate-content copia los posts de un MongoDB (el local) a otro (el
// de producción) y sus portadas del almacén local (FILES_STORE=local) al
// bucket de GCS, con las URLs de portada reescritas al bucket.
//
// Solo copia la colección posts: ni usuarios, ni sesiones, ni comentarios, ni
// CV, ni el índice del RAG. Es idempotente: cada post se escribe por su _id,
// uno que ya está igual no se toca, uno editado en el destino después que en
// el origen no se pisa y un archivo que ya está en el bucket no se vuelve a
// subir. Si el destino tiene un post con el mismo slug y otro _id, o falta
// alguna portada en disco, no escribe nada.
//
// Por defecto es un simulacro (-dry-run=true). Las URIs llegan en MONGO_URI y
// TARGET_MONGO_URI, nunca como argumento, para que no aparezcan en la lista de
// procesos, y no se imprimen. Se corre a mano con make prod-migrate-content.
// Nunca en CI.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/files/gcs"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const timeout = 5 * time.Minute

// bucketName son los nombres de bucket de GCS sin puntos.
var bucketName = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$`)

// postStatuses son los estados de domain.PostStatus.
var postStatuses = []string{"draft", "published", "archived"}

// options son los argumentos del comando.
type options struct {
	sourceURI      string
	sourceDB       string
	targetURI      string
	targetDB       string
	bucket         string
	filesDir       string
	sourceBaseURL  string
	targetFilesDir string
	statuses       []string
	slugs          []string
	dryRun         bool
}

func main() {
	var (
		opts     options
		statuses string
		slugs    string
	)

	flag.StringVar(&opts.sourceDB, "source-db", "", "base de origen (obligatoria)")
	flag.StringVar(&opts.targetDB, "target-db", "", "base de destino (obligatoria)")
	flag.StringVar(&opts.bucket, "bucket", "", "bucket de destino de las portadas (obligatorio)")
	flag.StringVar(&opts.filesDir, "files-dir", "", "directorio del almacén local, FILES_LOCAL_DIR (obligatorio)")
	flag.StringVar(&opts.sourceBaseURL, "source-base-url", "", "URL con que el almacén local sirve los archivos, FILES_LOCAL_BASE_URL (obligatoria)")
	flag.StringVar(&opts.targetFilesDir, "target-files-dir", "", "solo para pruebas: copia los archivos a este directorio en lugar del bucket")
	flag.StringVar(&statuses, "statuses", "published,draft", "estados que se migran, separados por comas")
	flag.StringVar(&slugs, "slugs", "", "solo estos slugs, separados por comas (vacío: todos los de -statuses)")
	flag.BoolVar(&opts.dryRun, "dry-run", true, "solo informar, sin escribir; -dry-run=false escribe")
	flag.Parse()

	opts.statuses = splitList(statuses)
	opts.slugs = splitList(slugs)
	opts.sourceURI = os.Getenv("MONGO_URI")
	opts.targetURI = os.Getenv("TARGET_MONGO_URI")

	if err := run(context.Background(), opts, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "migrate-content:", redact(err.Error(), opts.sourceURI, opts.targetURI))
		os.Exit(1)
	}
}

func run(ctx context.Context, opts options, out io.Writer) error {
	if err := validate(opts); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	source, err := mongodb.Connect(ctx, opts.sourceURI, opts.sourceDB)
	if err != nil {
		// El error del driver puede incluir la URI: no se imprime.
		return errors.New("no se pudo conectar al origen con MONGO_URI y -source-db")
	}

	defer func() { _ = source.Disconnect(context.Background()) }()

	target, err := mongodb.Connect(ctx, opts.targetURI, opts.targetDB)
	if err != nil {
		return errors.New("no se pudo conectar al destino con TARGET_MONGO_URI y -target-db")
	}

	defer func() { _ = target.Disconnect(context.Background()) }()

	var files uploader = gcloudUploader{bucket: opts.bucket}
	if opts.targetFilesDir != "" {
		files = dirUploader{dir: opts.targetFilesDir}
	}

	m := migration{
		source:   mongodb.NewPostRepository(source),
		target:   mongodb.NewPostRepository(target),
		files:    files,
		rewriter: newRewriter(opts.sourceBaseURL, gcs.DefaultPublicURL+"/"+opts.bucket),
		filter:   filter{statuses: opts.statuses, slugs: opts.slugs},
		filesDir: opts.filesDir,
		dryRun:   opts.dryRun,
		out:      out,
	}

	return m.run(ctx)
}

func validate(opts options) error {
	switch {
	case opts.sourceURI == "":
		return errors.New("falta MONGO_URI (la de .env)")
	case opts.targetURI == "":
		return errors.New("falta TARGET_MONGO_URI: el comando no tiene destino por defecto")
	case opts.sourceDB == "":
		return errors.New("falta -source-db")
	case opts.targetDB == "":
		return errors.New("falta -target-db")
	case opts.sourceURI == opts.targetURI && opts.sourceDB == opts.targetDB:
		return errors.New("el origen y el destino son la misma base")
	case !bucketName.MatchString(opts.bucket):
		return fmt.Errorf("-bucket %q no es un nombre de bucket válido", opts.bucket)
	case opts.filesDir == "":
		return errors.New("falta -files-dir")
	case len(opts.statuses) == 0:
		return errors.New("-statuses está vacío")
	}

	for _, status := range opts.statuses {
		if !slices.Contains(postStatuses, status) {
			return fmt.Errorf("-statuses: %q no es un estado (%s)", status, strings.Join(postStatuses, ", "))
		}
	}

	parsed, err := url.Parse(opts.sourceBaseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("-source-base-url %q debe ser una URL http(s), por ejemplo http://localhost:8080/media", opts.sourceBaseURL)
	}

	return nil
}

func splitList(value string) []string {
	var items []string

	for item := range strings.SplitSeq(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}

	return items
}

// redact quita las URIs de un mensaje de error, por si alguna capa la incluyó.
func redact(message string, secrets ...string) string {
	for _, secret := range secrets {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "<uri>")
		}
	}

	return message
}
