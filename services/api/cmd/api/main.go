// Package main arranca la API HTTP.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/config"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/repository/mongodb"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 15 * time.Second
	shutdownTimeout   = 8 * time.Second
)

func main() {
	if err := run(); err != nil {
		slog.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	spec, err := handler.LoadSpec(ctx)
	if err != nil {
		return fmt.Errorf("load api contract: %w", err)
	}

	client, err := mongodb.Connect(ctx, cfg.MongoURI, cfg.MongoDBName)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}

	if err := client.EnsureIndexes(ctx); err != nil {
		return errors.Join(fmt.Errorf("ensure indexes: %w", err), client.Disconnect(ctx))
	}

	bootstrap := service.NewAdminBootstrap(mongodb.NewUserRepository(client), slog.Default())
	if err := bootstrap.Run(ctx, cfg.InitialAdminEmail, cfg.InitialAdminPassword); err != nil {
		return errors.Join(fmt.Errorf("bootstrap admin: %w", err), client.Disconnect(ctx))
	}

	routerConfig := handler.RouterConfig{
		AllowedOrigins: cfg.AllowedOrigins,
		MaxBodyBytes:   cfg.MaxBodyBytes,
		TrustedProxies: cfg.TrustedProxies,
		RateLimits: handler.RateLimits{
			Global:  handler.RateLimit(cfg.GlobalRateLimit),
			Login:   handler.RateLimit(cfg.LoginRateLimit),
			Refresh: handler.RateLimit(cfg.RefreshRateLimit),
		},
	}

	router, err := handler.NewRouter(client, spec, routerConfig)
	if err != nil {
		return errors.Join(fmt.Errorf("create router: %w", err), client.Disconnect(ctx))
	}

	server := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
	}

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", server.Addr)
		serveErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return errors.Join(fmt.Errorf("serve: %w", err), shutdown(server, client))
	case <-ctx.Done():
	}

	stop()
	slog.Info("api shutting down")

	return shutdown(server, client)
}

// shutdown cierra el servidor y después la base de datos, para que las
// peticiones en curso terminen con la conexión abierta.
func shutdown(server *http.Server, client *mongodb.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	var shutdownErr error
	if err := server.Shutdown(ctx); err != nil {
		shutdownErr = fmt.Errorf("shutdown: %w", err)
	}

	return errors.Join(shutdownErr, client.Disconnect(ctx))
}
