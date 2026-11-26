// Command reset-admin-password restablece la contraseña de un administrador
// cuando ya no se puede entrar al admin para cambiarla (ADR-032). Es el
// procedimiento de recuperación del runbook.
//
// Lee el email y la contraseña nueva (dos veces) de la terminal, sin eco:
// nunca por argumento ni por variable de entorno, para que no queden en la
// lista de procesos ni en el historial del shell. Si stdin no es una terminal,
// no arranca. La URI del MongoDB llega en TARGET_MONGO_URI, sin valor por
// defecto, y no se imprime.
//
// Por defecto es un simulacro (-dry-run=true): comprueba que el usuario existe
// y que la contraseña cumple las reglas, sin escribir. Con -dry-run=false
// guarda el hash bcrypt y revoca todos los refresh tokens del usuario. Se corre
// a mano con make reset-admin-password. Nunca en CI.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"golang.org/x/term"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const timeout = time.Minute

// options son los argumentos del comando.
type options struct {
	uri    string
	db     string
	dryRun bool
}

// prompter lee un dato secreto. En la terminal es term.ReadPassword; los tests
// usan uno propio.
type prompter interface {
	ReadSecret(prompt string) (string, error)
}

func main() {
	var opts options

	flag.StringVar(&opts.db, "db", "", "base de datos de la API (obligatoria)")
	flag.BoolVar(&opts.dryRun, "dry-run", true, "solo comprobar, sin escribir; -dry-run=false cambia la contraseña")
	flag.Parse()

	opts.uri = os.Getenv("TARGET_MONGO_URI")

	input, err := newTerminalPrompter(os.Stdin, os.Stderr)
	if err == nil {
		err = run(context.Background(), opts, input, os.Stdout)
	}

	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "reset-admin-password:", redact(err.Error(), opts.uri))
		os.Exit(1)
	}
}

func run(ctx context.Context, opts options, input prompter, out io.Writer) error {
	if err := validate(opts); err != nil {
		return err
	}

	email, password, err := readCredentials(input)
	if err != nil {
		return err
	}

	// El plazo corre después de leer: escribir la contraseña no gasta tiempo
	// de la conexión.
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	client, err := mongodb.Connect(ctx, opts.uri, opts.db)
	if err != nil {
		// El error del driver puede incluir la URI: no se imprime.
		return errors.New("no se pudo conectar con TARGET_MONGO_URI y -db")
	}

	defer func() { _ = client.Disconnect(context.Background()) }()

	reset := service.NewPasswordReset(mongodb.NewUserRepository(client), mongodb.NewRefreshTokenRepository(client), time.Now)

	result, err := reset.Reset(ctx, email, password, opts.dryRun)
	if err != nil {
		return explain(err)
	}

	return report(out, opts, result)
}

func validate(opts options) error {
	switch {
	case opts.uri == "":
		return errors.New("falta TARGET_MONGO_URI: el comando no tiene destino por defecto")
	case opts.db == "":
		return errors.New("falta -db")
	}

	return nil
}

// readCredentials pide el email y dos veces la contraseña nueva.
func readCredentials(input prompter) (string, string, error) {
	email, err := input.ReadSecret("Email del administrador: ")
	if err != nil {
		return "", "", fmt.Errorf("leer el email: %w", err)
	}

	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", errors.New("el email está vacío")
	}

	password, err := input.ReadSecret(fmt.Sprintf("Contraseña nueva (%d caracteres o más): ", service.MinNewPasswordRunes))
	if err != nil {
		return "", "", fmt.Errorf("leer la contraseña: %w", err)
	}

	confirmation, err := input.ReadSecret("Repite la contraseña nueva: ")
	if err != nil {
		return "", "", fmt.Errorf("leer la confirmación: %w", err)
	}

	if password != confirmation {
		return "", "", errors.New("las contraseñas no coinciden")
	}

	return email, password, nil
}

// explain traduce los errores del caso de uso a un mensaje para quien corre el
// comando, sin repetir el email ni la contraseña.
func explain(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return errors.New("no hay ningún usuario con ese email en esa base")
	case errors.Is(err, domain.ErrPasswordUnchanged):
		return errors.New("la contraseña nueva es igual a la actual")
	case errors.Is(err, domain.ErrPasswordTooShort):
		return fmt.Errorf("la contraseña nueva debe tener al menos %d caracteres", service.MinNewPasswordRunes)
	case errors.Is(err, domain.ErrPasswordTooLong):
		return errors.New("la contraseña nueva pasa de 72 bytes, el límite de bcrypt")
	default:
		return err
	}
}

func report(out io.Writer, opts options, result service.ResetResult) error {
	var text string
	if opts.dryRun {
		text = fmt.Sprintf("Simulacro en la base %q: el usuario %s existe y la contraseña cumple las reglas.\n"+
			"No se cambió nada. Para aplicarlo, corre de nuevo con DRY_RUN=0.\n", opts.db, result.UserID)
	} else {
		text = fmt.Sprintf("Contraseña cambiada para el usuario %s en la base %q.\n"+
			"Refresh tokens revocados: %d. Los JWT de acceso ya emitidos vencen en %s como mucho.\n",
			result.UserID, opts.db, result.SessionsRevoked, service.AccessTokenTTL)
	}

	if _, err := io.WriteString(out, text); err != nil {
		return fmt.Errorf("write report: %w", err)
	}

	return nil
}

// terminalPrompter lee de la terminal sin eco. Escribe las preguntas en
// stderr, para que stdout quede solo con el resultado.
type terminalPrompter struct {
	fd     int
	prompt io.Writer
}

// newTerminalPrompter rechaza un stdin que no es una terminal: así la
// contraseña no puede llegar por una tubería desde el historial del shell.
func newTerminalPrompter(stdin *os.File, prompt io.Writer) (terminalPrompter, error) {
	fd := int(stdin.Fd()) //nolint:gosec // Un descriptor de archivo siempre cabe en int.
	if !term.IsTerminal(fd) {
		return terminalPrompter{}, errors.New("stdin no es una terminal: el email y la contraseña se escriben a mano, sin tuberías")
	}

	return terminalPrompter{fd: fd, prompt: prompt}, nil
}

func (p terminalPrompter) ReadSecret(prompt string) (string, error) {
	if _, err := io.WriteString(p.prompt, prompt); err != nil {
		return "", fmt.Errorf("write prompt: %w", err)
	}

	value, err := term.ReadPassword(p.fd)
	if err != nil {
		return "", fmt.Errorf("read from terminal: %w", err)
	}

	// ReadPassword no imprime el salto de línea que el usuario tecleó.
	if _, err := io.WriteString(p.prompt, "\n"); err != nil {
		return "", fmt.Errorf("write prompt: %w", err)
	}

	return string(value), nil
}

// redact quita la URI de un mensaje de error, por si alguna capa la incluyó.
func redact(message, uri string) string {
	if uri == "" {
		return message
	}

	return strings.ReplaceAll(message, uri, "<uri>")
}
