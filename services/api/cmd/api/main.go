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

	"github.com/HuitziDomingo/personal-blog/services/api/internal/assistant/gemini"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/config"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler"
	"github.com/HuitziDomingo/personal-blog/services/api/internal/logging"
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
	logger := newLogger()
	slog.SetDefault(logger)

	if err := run(logger); err != nil {
		logger.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

// newLogger crea el logger antes de cargar el resto de la configuración, para
// que un error de arranque también salga en JSON en producción. Con un
// LOG_FORMAT inválido usa JSON, y run devuelve el error de config.Load.
func newLogger() *slog.Logger {
	format, err := config.LoadLogFormat()
	if err != nil {
		format = config.LogFormatJSON
	}

	return logging.New(os.Stderr, logging.Format(format))
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	handler.SetMode(cfg.GinMode)

	for _, warning := range cfg.Warnings() {
		logger.Warn(warning)
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

	users := mongodb.NewUserRepository(client)

	bootstrap := service.NewAdminBootstrap(users, slog.Default())
	if err := bootstrap.Run(ctx, cfg.InitialAdminEmail, cfg.InitialAdminPassword); err != nil {
		return errors.Join(fmt.Errorf("bootstrap admin: %w", err), client.Disconnect(ctx))
	}

	sessions, err := newSessions(cfg, client, users)
	if err != nil {
		return errors.Join(err, client.Disconnect(ctx))
	}

	assistant, err := newAssistant(ctx, cfg.Assistant, logger)
	if err != nil {
		return errors.Join(err, client.Disconnect(ctx))
	}

	posts := service.NewPostService(mongodb.NewPostRepository(client), time.Now)

	moderation, err := newModeration(ctx, cfg, logger)
	if err != nil {
		return errors.Join(err, client.Disconnect(ctx))
	}

	if cfg.Comments.Enabled {
		slog.Info("comments enabled", "llm_moderation", moderation != nil)
	}

	routerConfig := handler.RouterConfig{
		AllowedOrigins:   cfg.AllowedOrigins,
		MaxBodyBytes:     cfg.MaxBodyBytes,
		TrustedProxies:   cfg.TrustedProxies,
		Sessions:         sessions,
		Posts:            posts,
		Assistant:        assistant,
		Comments:         service.NewCommentService(mongodb.NewCommentRepository(client), posts, moderation, cfg.Comments.Enabled, time.Now),
		AssistantTimeout: cfg.Assistant.Timeout,
		Logger:           logger,
		JSONLogs:         cfg.LogFormat == config.LogFormatJSON,
		RateLimits: handler.RateLimits{
			Global:    handler.RateLimit(cfg.GlobalRateLimit),
			Login:     handler.RateLimit(cfg.LoginRateLimit),
			Refresh:   handler.RateLimit(cfg.RefreshRateLimit),
			Preflight: handler.RateLimit(cfg.PreflightRateLimit),
			User:      handler.RateLimit(cfg.UserRateLimit),
			Assistant: handler.RateLimit(cfg.AssistantRateLimit),
			Comments:  handler.WindowLimit{Max: cfg.Comments.RateLimitMax, Window: cfg.Comments.RateLimitWindow},
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
		// Los errores internos del servidor (handshakes, escrituras dobles)
		// salen por slog como WARN, no como INFO.
		ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
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

// newSessions arma el login y la sesión sobre MongoDB.
func newSessions(cfg config.Config, client *mongodb.Client, users *mongodb.UserRepository) (*service.AuthService, error) {
	tokens, err := service.NewTokenService(cfg.JWTSecret, mongodb.NewRefreshTokenRepository(client), users, time.Now)
	if err != nil {
		return nil, fmt.Errorf("create token service: %w", err)
	}

	sessions, err := service.NewAuthService(users, tokens, time.Now)
	if err != nil {
		return nil, fmt.Errorf("create auth service: %w", err)
	}

	return sessions, nil
}

// newAssistant arma el asistente de escritura sobre Gemini, o el desactivado
// si ASSISTANT_ENABLED no es true (ADR-021).
func newAssistant(ctx context.Context, cfg config.Assistant, logger *slog.Logger) (*service.AssistantService, error) {
	if !cfg.Enabled {
		return service.NewDisabledAssistant(), nil
	}

	provider, err := gemini.New(ctx, gemini.Config{
		APIKey:          cfg.GeminiAPIKey.Reveal(),
		Model:           cfg.GeminiModel,
		ThinkingLevel:   cfg.ThinkingLevel,
		MaxOutputTokens: cfg.MaxOutputTokens,
	})
	if err != nil {
		return nil, fmt.Errorf("create writing assistant: %w", err)
	}

	assistant, err := service.NewAssistantService(provider, cfg.Timeout, logger, time.Now)
	if err != nil {
		return nil, fmt.Errorf("create writing assistant: %w", err)
	}

	slog.Info("writing assistant enabled",
		"model", cfg.GeminiModel,
		"timeout", cfg.Timeout,
		"thinking_level", cfg.ThinkingLevel,
		"max_output_tokens", cfg.MaxOutputTokens,
	)

	return assistant, nil
}

// newModeration arma el clasificador de comentarios sobre Gemini, con el mismo
// nivel de razonamiento y límite de salida que el asistente, o nil si
// COMMENTS_MODERATION_ENABLED no es true (ADR-022).
func newModeration(ctx context.Context, cfg config.Config, logger *slog.Logger) (*service.ModerationService, error) {
	if !cfg.Comments.ModerationEnabled {
		return nil, nil
	}

	provider, err := gemini.New(ctx, gemini.Config{
		APIKey:          cfg.Comments.GeminiAPIKey.Reveal(),
		Model:           cfg.Comments.ModerationModel,
		ThinkingLevel:   cfg.Assistant.ThinkingLevel,
		MaxOutputTokens: cfg.Assistant.MaxOutputTokens,
	})
	if err != nil {
		return nil, fmt.Errorf("create comment moderator: %w", err)
	}

	moderation, err := service.NewModerationService(provider, cfg.Comments.ModerationTimeout, logger, time.Now)
	if err != nil {
		return nil, fmt.Errorf("create comment moderator: %w", err)
	}

	slog.Info("comment moderation enabled",
		"model", cfg.Comments.ModerationModel,
		"timeout", cfg.Comments.ModerationTimeout,
		"thinking_level", cfg.Assistant.ThinkingLevel,
	)

	return moderation, nil
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
