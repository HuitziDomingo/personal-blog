// Command import-old-posts importa los 2 posts de la web anterior
// (HuitziDomingo/next-chakraUI) al MongoDB LOCAL, desde su versión en
// Markdown de docs/web/posts-migrados/ (BLOG-076).
//
// Cada post se valida con las reglas de la API (service y esquema PostWrite
// del contrato) y se guarda publicado, con la fecha del commit que creó su
// página como fecha de publicación y de creación, y la de su último cambio
// como fecha de actualización. La portada va al almacén local
// (FILES_LOCAL_DIR, covers/<post>/<hash>.webp, como la API) con su URL local;
// las imágenes dentro del texto se quedan como /img/blog/..., que sirve la web.
//
// Es idempotente: un post que ya existe igual no cambia, uno con otros datos
// no se pisa, y una portada distinta tampoco. Solo acepta un MongoDB en esta
// máquina. Por defecto es un simulacro (-dry-run=true). Se corre a mano con
// make api-import-old-posts. Nunca en CI.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
)

const timeout = time.Minute

// options son los argumentos del comando.
type options struct {
	mongoURI    string
	database    string
	authorEmail string
	authorID    string
	postsDir    string
	publicDir   string
	filesDir    string
	baseURL     string
	dryRun      bool
}

func main() {
	var opts options

	flag.StringVar(&opts.database, "db", "", "base local (obligatoria)")
	flag.StringVar(&opts.authorEmail, "author-email", "", "email del administrador local que firma los posts")
	flag.StringVar(&opts.authorID, "author-id", "", "id del administrador local; en lugar de -author-email")
	flag.StringVar(&opts.postsDir, "posts-dir", "../../docs/web/posts-migrados", "directorio con los Markdown")
	flag.StringVar(&opts.publicDir, "public-dir", "../../apps/web/public", "directorio public/ de apps/web")
	flag.StringVar(&opts.filesDir, "files-dir", "", "almacén local, FILES_LOCAL_DIR (obligatorio)")
	flag.StringVar(&opts.baseURL, "base-url", "", "URL del almacén local, FILES_LOCAL_BASE_URL (obligatoria)")
	flag.BoolVar(&opts.dryRun, "dry-run", true, "solo informar, sin escribir; -dry-run=false escribe")
	flag.Parse()

	opts.mongoURI = os.Getenv("MONGO_URI")

	if err := run(context.Background(), opts, os.Stdout); err != nil {
		message := err.Error()
		if opts.mongoURI != "" {
			message = strings.ReplaceAll(message, opts.mongoURI, "<uri>")
		}

		fmt.Fprintln(os.Stderr, "import-old-posts:", message)
		os.Exit(1)
	}
}

func run(ctx context.Context, opts options, out io.Writer) error {
	if err := validate(opts); err != nil {
		return err
	}

	spec, err := gen.GetSpec()
	if err != nil {
		return fmt.Errorf("cargar el contrato: %w", err)
	}

	postWrite, ok := spec.Components.Schemas["PostWrite"]
	if !ok || postWrite.Value == nil {
		return errors.New("el contrato no tiene el esquema PostWrite")
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client, err := mongodb.Connect(ctx, opts.mongoURI, opts.database)
	if err != nil {
		// El error del driver puede incluir la URI: no se imprime.
		return errors.New("no se pudo conectar a MongoDB con MONGO_URI y -db")
	}

	defer func() { _ = client.Disconnect(context.Background()) }()

	authorID, err := findAuthor(ctx, mongodb.NewUserRepository(client), opts)
	if err != nil {
		return err
	}

	return importer{
		posts:     mongodb.NewPostRepository(client),
		authorID:  authorID,
		postsDir:  opts.postsDir,
		publicDir: opts.publicDir,
		filesDir:  opts.filesDir,
		baseURL:   opts.baseURL,
		postWrite: postWrite.Value,
		dryRun:    opts.dryRun,
		out:       out,
	}.run(ctx)
}

// userLookup es lo que el comando necesita de los usuarios.
type userLookup interface {
	GetByID(ctx context.Context, id string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
}

func findAuthor(ctx context.Context, users userLookup, opts options) (string, error) {
	var (
		user *domain.User
		err  error
	)

	if opts.authorID != "" {
		user, err = users.GetByID(ctx, opts.authorID)
	} else {
		user, err = users.GetByEmail(ctx, opts.authorEmail)
	}

	switch {
	case errors.Is(err, domain.ErrNotFound):
		return "", errors.New("el autor no existe en la base local (-author-email o -author-id)")
	case err != nil:
		return "", fmt.Errorf("buscar el autor: %w", err)
	case user.Role != domain.UserRoleAdmin:
		return "", errors.New("el autor no es administrador")
	}

	return user.ID, nil
}

func validate(opts options) error {
	switch {
	case opts.mongoURI == "":
		return errors.New("falta MONGO_URI (la de .env)")
	case !isLocalMongo(opts.mongoURI):
		return errors.New("MONGO_URI no apunta a un MongoDB en esta máquina: este comando solo importa en local")
	case opts.database == "":
		return errors.New("falta -db")
	case opts.authorEmail == "" && opts.authorID == "":
		return errors.New("falta -author-email o -author-id")
	case opts.filesDir == "":
		return errors.New("falta -files-dir")
	}

	parsed, err := url.Parse(opts.baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("-base-url %q debe ser una URL http(s), por ejemplo http://localhost:8080/media", opts.baseURL)
	}

	return nil
}

// isLocalMongo acepta solo mongodb:// con todos sus hosts en esta máquina.
// mongodb+srv:// (Atlas) nunca es local.
func isLocalMongo(uri string) bool {
	rest, ok := strings.CutPrefix(uri, "mongodb://")
	if !ok {
		return false
	}

	hosts, _, _ := strings.Cut(rest, "/")
	if at := strings.LastIndex(hosts, "@"); at >= 0 {
		hosts = hosts[at+1:]
	}

	hosts, _, _ = strings.Cut(hosts, "?")
	if hosts == "" {
		return false
	}

	for host := range strings.SplitSeq(hosts, ",") {
		name := host
		if strings.HasPrefix(host, "[") {
			name, _, _ = strings.Cut(strings.TrimPrefix(host, "["), "]")
		} else if i := strings.LastIndex(host, ":"); i >= 0 {
			name = host[:i]
		}

		if name != "localhost" && name != "127.0.0.1" && name != "::1" {
			return false
		}
	}

	return true
}
