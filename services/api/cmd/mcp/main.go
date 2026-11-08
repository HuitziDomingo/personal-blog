// Command mcp es el servidor MCP de solo lectura del blog (ADR-019). Habla por
// stdio con un cliente en la misma máquina y no escucha en la red.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/mcp"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const disconnectTimeout = 5 * time.Second

func main() {
	// stdout es el canal del protocolo: los logs van siempre a stderr.
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	if err := run(logger); err != nil {
		logger.Error("mcp server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	uri, dbName := os.Getenv("MONGO_URI"), os.Getenv("MONGO_DB_NAME")
	if uri == "" || dbName == "" {
		return errors.New("MONGO_URI and MONGO_DB_NAME are required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client, err := mongodb.Connect(ctx, uri, dbName)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}

	posts := service.NewPostService(mongodb.NewPostRepository(client), time.Now)
	server := mcp.NewServer(posts, version(), logger)

	logger.Info("mcp server ready on stdio")
	runErr := server.Run(ctx, &sdk.StdioTransport{})
	if errors.Is(runErr, context.Canceled) {
		runErr = nil
	}

	disconnectCtx, cancel := context.WithTimeout(context.Background(), disconnectTimeout)
	defer cancel()

	return errors.Join(runErr, client.Disconnect(disconnectCtx))
}

// version es la que Go estampa al compilar (un tag o una pseudo-versión del
// commit); "dev" solo con go run o sin información de VCS.
func version() string {
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}

	return "dev"
}
