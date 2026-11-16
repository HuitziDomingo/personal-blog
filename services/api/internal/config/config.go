// Package config carga la configuración de la API desde variables de entorno.
package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	// MinJWTSecretBytes es el tamaño mínimo del secreto de los JWT (ADR-010).
	MinJWTSecretBytes = 32

	defaultPort         = "8080"
	defaultMaxBodyBytes = 1 << 20 // 1 MB

	// defaultAssistantTimeout es el timeout de una llamada al proveedor del
	// asistente (ADR-021).
	defaultAssistantTimeoutSeconds = 30
	// defaultAssistantThinkingLevel es bajo porque corregir la redacción y
	// sugerir metadatos no necesitan razonar; con el del modelo, cada
	// llamada tardaba de 20 s a más de 3 min. MINIMAL sería menor, pero no
	// todos los modelos lo aceptan (gemini-3.8-flash responde 400).
	defaultAssistantThinkingLevel = "LOW"
	// defaultAssistantMaxOutputTokens alcanza para reescribir un borrador
	// del tamaño máximo (50 000 caracteres, unos 15 000 tokens) más el
	// razonamiento, que cuenta para el mismo límite.
	defaultAssistantMaxOutputTokens = 16384

	// LogFormatText es el formato de log por defecto, legible en una terminal.
	LogFormatText = "text"
	// LogFormatJSON escribe una línea JSON por evento, con los campos que
	// entiende Cloud Logging (severity y message).
	LogFormatJSON = "json"

	// GinModeDebug es el modo de desarrollo de Gin: lista las rutas al arrancar.
	GinModeDebug = "debug"
	// GinModeRelease es el modo de producción de Gin, sin salida de debug.
	GinModeRelease = "release"
	// GinModeTest es el modo de Gin para los tests.
	GinModeTest = "test"
)

// Config es la configuración de la API.
type Config struct {
	Port        string
	MongoURI    string
	MongoDBName string

	// JWTSecret firma los JWT de acceso; al menos MinJWTSecretBytes bytes.
	JWTSecret []byte

	AllowedOrigins []string
	MaxBodyBytes   int64

	// TrustedProxies es el rango del par directo de Cloud Run; vacío en local.
	TrustedProxies   []string
	GlobalRateLimit  RateLimit
	LoginRateLimit   RateLimit
	RefreshRateLimit RateLimit
	// PreflightRateLimit y UserRateLimit son los buckets de ADR-016.
	PreflightRateLimit RateLimit
	UserRateLimit      RateLimit
	// AssistantRateLimit es el bucket por usuario del asistente (ADR-021).
	AssistantRateLimit RateLimit

	Assistant Assistant

	Comments Comments

	// Opcionales: solo se usan para crear el administrador inicial.
	InitialAdminEmail    string
	InitialAdminPassword string

	// LogFormat es LogFormatText o LogFormatJSON.
	LogFormat string
	// GinMode es el modo de Gin: el de GIN_MODE, o si falta, release con logs
	// JSON y debug con logs de texto.
	GinMode string
}

// Load lee la configuración del entorno y devuelve un error si no es válida.
func Load() (Config, error) {
	port, err := loadPort()
	if err != nil {
		return Config{}, err
	}

	mongoURI, err := required("MONGO_URI")
	if err != nil {
		return Config{}, err
	}

	mongoDBName, err := required("MONGO_DB_NAME")
	if err != nil {
		return Config{}, err
	}

	jwtSecret, err := loadJWTSecret()
	if err != nil {
		return Config{}, err
	}

	allowedOrigins, err := loadAllowedOrigins()
	if err != nil {
		return Config{}, err
	}

	maxBodyBytes, err := loadMaxBodyBytes()
	if err != nil {
		return Config{}, err
	}

	trustedProxies, err := loadTrustedProxies()
	if err != nil {
		return Config{}, err
	}

	logFormat, err := LoadLogFormat()
	if err != nil {
		return Config{}, err
	}

	ginMode, err := loadGinMode(logFormat)
	if err != nil {
		return Config{}, err
	}

	assistant, err := loadAssistant()
	if err != nil {
		return Config{}, err
	}

	comments, err := loadComments()
	if err != nil {
		return Config{}, err
	}

	var limits [len(rateLimitSpecs)]RateLimit
	for i, spec := range rateLimitSpecs {
		if limits[i], err = loadRateLimit(spec); err != nil {
			return Config{}, err
		}
	}

	return Config{
		TrustedProxies:       trustedProxies,
		GlobalRateLimit:      limits[0],
		LoginRateLimit:       limits[1],
		RefreshRateLimit:     limits[2],
		PreflightRateLimit:   limits[3],
		UserRateLimit:        limits[4],
		AssistantRateLimit:   limits[5],
		Assistant:            assistant,
		Comments:             comments,
		Port:                 port,
		MongoURI:             mongoURI,
		MongoDBName:          mongoDBName,
		JWTSecret:            jwtSecret,
		AllowedOrigins:       allowedOrigins,
		MaxBodyBytes:         maxBodyBytes,
		InitialAdminEmail:    os.Getenv("INITIAL_ADMIN_EMAIL"),
		InitialAdminPassword: os.Getenv("INITIAL_ADMIN_PASSWORD"),
		LogFormat:            logFormat,
		GinMode:              ginMode,
	}, nil
}

// LoadLogFormat lee LOG_FORMAT. Es pública porque main crea el logger antes de
// cargar el resto, para que también los errores de configuración salgan en el
// formato pedido.
func LoadLogFormat() (string, error) {
	switch format := os.Getenv("LOG_FORMAT"); format {
	case "", LogFormatText:
		return LogFormatText, nil
	case LogFormatJSON:
		return LogFormatJSON, nil
	default:
		return "", fmt.Errorf("invalid LOG_FORMAT %q: must be text or json", format)
	}
}

// loadGinMode lee GIN_MODE. Sin variable, los logs JSON implican producción:
// release, para que Gin no mezcle sus avisos de debug en texto con el JSON.
// Gin también lee GIN_MODE al iniciarse y hace panic con un valor inválido
// antes de llegar aquí; la validación sirve para los tests y por si eso cambia.
func loadGinMode(logFormat string) (string, error) {
	mode := os.Getenv("GIN_MODE")
	switch mode {
	case GinModeDebug, GinModeRelease, GinModeTest:
		return mode, nil
	case "":
		if logFormat == LogFormatJSON {
			return GinModeRelease, nil
		}

		return GinModeDebug, nil
	default:
		return "", fmt.Errorf("invalid GIN_MODE %q: must be debug, release or test", mode)
	}
}

// loadJWTSecret lee el secreto de firma. Es obligatorio porque la API siempre
// registra las rutas de autenticación.
func loadJWTSecret() ([]byte, error) {
	secret, err := required("JWT_SECRET")
	if err != nil {
		return nil, err
	}

	if len(secret) < MinJWTSecretBytes {
		return nil, fmt.Errorf("invalid JWT_SECRET: must be at least %d bytes", MinJWTSecretBytes)
	}

	return []byte(secret), nil
}

func loadPort() (string, error) {
	port, ok := os.LookupEnv("PORT")
	if !ok || port == "" {
		return defaultPort, nil
	}

	number, err := strconv.ParseUint(port, 10, 16)
	if err != nil || number == 0 {
		return "", fmt.Errorf("invalid PORT %q: must be a number between 1 and 65535", port)
	}

	return port, nil
}

// loadAllowedOrigins lee la allowlist. Sin variable la lista queda vacía: ningún
// navegador puede cambiar estado.
func loadAllowedOrigins() ([]string, error) {
	var origins []string

	for origin := range strings.SplitSeq(os.Getenv("ALLOWED_ORIGINS"), ",") {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}

		if !isExactOrigin(origin) {
			return nil, fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: must be scheme://host[:port], without wildcards", origin)
		}

		origins = append(origins, origin)
	}

	return origins, nil
}

// isExactOrigin comprueba que el valor pueda coincidir con una cabecera Origin:
// una barra final, una ruta o un comodín nunca coincidirían, o lo harían de más.
func isExactOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || strings.Contains(origin, "*") {
		return false
	}

	isHTTP := parsed.Scheme == "http" || parsed.Scheme == "https"

	return isHTTP && parsed.Host != "" && origin == parsed.Scheme+"://"+parsed.Host
}

func loadMaxBodyBytes() (int64, error) {
	value := os.Getenv("MAX_BODY_BYTES")
	if value == "" {
		return defaultMaxBodyBytes, nil
	}

	maxBytes, err := strconv.ParseInt(value, 10, 64)
	if err != nil || maxBytes <= 0 {
		return 0, fmt.Errorf("invalid MAX_BODY_BYTES %q: must be a positive number", value)
	}

	return maxBytes, nil
}

// RateLimit es un límite por IP o por usuario: PerMinute peticiones por
// minuto, con ráfagas de hasta Burst.
type RateLimit struct {
	PerMinute int
	Burst     int
}

type rateLimitSpec struct {
	name     string
	defaults RateLimit
}

// rateLimitSpecs son los valores por defecto de ADR-010 (global, login y
// refresh), de ADR-016 (preflight y usuario autenticado) y de ADR-021
// (asistente).
var rateLimitSpecs = [...]rateLimitSpec{
	{name: "GLOBAL", defaults: RateLimit{PerMinute: 60, Burst: 20}},
	{name: "LOGIN", defaults: RateLimit{PerMinute: 5, Burst: 5}},
	{name: "REFRESH", defaults: RateLimit{PerMinute: 10, Burst: 10}},
	{name: "PREFLIGHT", defaults: RateLimit{PerMinute: 120, Burst: 60}},
	{name: "USER", defaults: RateLimit{PerMinute: 300, Burst: 100}},
	{name: "ASSISTANT", defaults: RateLimit{PerMinute: 5, Burst: 5}},
}

func loadRateLimit(spec rateLimitSpec) (RateLimit, error) {
	perMinute, err := positiveInt("RATE_LIMIT_"+spec.name+"_PER_MINUTE", spec.defaults.PerMinute)
	if err != nil {
		return RateLimit{}, err
	}

	burst, err := positiveInt("RATE_LIMIT_"+spec.name+"_BURST", spec.defaults.Burst)
	if err != nil {
		return RateLimit{}, err
	}

	return RateLimit{PerMinute: perMinute, Burst: burst}, nil
}

func positiveInt(key string, fallback int) (int, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	number, err := strconv.Atoi(value)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid %s %q: must be a positive number", key, value)
	}

	return number, nil
}

// positiveInt32 es positiveInt para un valor que el SDK de Gemini pide como
// int32: ParseInt con 32 bits rechaza lo que no cabe, sin conversión.
func positiveInt32(key string, fallback int32) (int32, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	number, err := strconv.ParseInt(value, 10, 32)
	if err != nil || number <= 0 {
		return 0, fmt.Errorf("invalid %s %q: must be a positive number up to %d", key, value, math.MaxInt32)
	}

	return int32(number), nil
}

// loadTrustedProxies acepta IPs y rangos CIDR. Un rango que lo cubra todo
// permitiría falsificar la IP con X-Forwarded-For.
func loadTrustedProxies() ([]string, error) {
	var proxies []string

	for proxy := range strings.SplitSeq(os.Getenv("TRUSTED_PROXIES"), ",") {
		proxy = strings.TrimSpace(proxy)
		if proxy == "" {
			continue
		}

		if !isValidProxy(proxy) {
			return nil, fmt.Errorf("invalid TRUSTED_PROXIES entry %q: must be an IP or a CIDR range that is not 0.0.0.0/0 or ::/0", proxy)
		}

		proxies = append(proxies, proxy)
	}

	return proxies, nil
}

func isValidProxy(proxy string) bool {
	if net.ParseIP(proxy) != nil {
		return true
	}

	_, network, err := net.ParseCIDR(proxy)
	if err != nil {
		return false
	}

	ones, _ := network.Mask.Size()

	return ones > 0
}

// required devuelve el valor de una variable obligatoria o un error si falta.
func required(key string) (string, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return "", fmt.Errorf("missing required environment variable %s", key)
	}

	return value, nil
}

// Secret es un valor secreto, como una API key. Se imprime como [REDACTED] con
// fmt, slog y JSON: registrar la configuración por error no lo filtra. El valor
// real solo sale con Reveal.
type Secret string

// Reveal devuelve el valor real.
func (s Secret) Reveal() string { return string(s) }

// String oculta el valor en fmt (%s y %v).
func (s Secret) String() string {
	if s == "" {
		return ""
	}

	return "[REDACTED]"
}

// GoString oculta el valor en fmt con %#v.
func (s Secret) GoString() string { return s.String() }

// LogValue oculta el valor en slog.
func (s Secret) LogValue() slog.Value { return slog.StringValue(s.String()) }

// MarshalJSON oculta el valor en JSON. Hace falta además de LogValue: el
// handler JSON de slog serializa un struct con encoding/json, y LogValue solo
// aplica cuando el Secret es el valor del atributo.
func (s Secret) MarshalJSON() ([]byte, error) { return json.Marshal(s.String()) }

// Assistant es la configuración del asistente de escritura (ADR-021).
type Assistant struct {
	// Enabled es false por defecto. Con false, las operaciones responden 503.
	Enabled      bool
	GeminiAPIKey Secret
	GeminiModel  string
	Timeout      time.Duration
	// ThinkingLevel es MINIMAL, LOW, MEDIUM o HIGH.
	ThinkingLevel   string
	MaxOutputTokens int32
}

// loadAssistant lee ASSISTANT_ENABLED, GEMINI_API_KEY, GEMINI_MODEL,
// ASSISTANT_TIMEOUT_SECONDS, ASSISTANT_THINKING_LEVEL y
// ASSISTANT_MAX_OUTPUT_TOKENS. Encendido sin key o sin modelo, la API no arranca:
// falla cerrado (ADR-021, punto 8).
func loadAssistant() (Assistant, error) {
	enabled, err := loadBool("ASSISTANT_ENABLED")
	if err != nil {
		return Assistant{}, err
	}

	timeoutSeconds, err := positiveInt("ASSISTANT_TIMEOUT_SECONDS", defaultAssistantTimeoutSeconds)
	if err != nil {
		return Assistant{}, err
	}

	thinkingLevel, err := loadThinkingLevel()
	if err != nil {
		return Assistant{}, err
	}

	maxOutputTokens, err := positiveInt32("ASSISTANT_MAX_OUTPUT_TOKENS", defaultAssistantMaxOutputTokens)
	if err != nil {
		return Assistant{}, err
	}

	assistant := Assistant{
		Enabled:         enabled,
		GeminiAPIKey:    Secret(os.Getenv("GEMINI_API_KEY")),
		GeminiModel:     strings.TrimSpace(os.Getenv("GEMINI_MODEL")),
		Timeout:         time.Duration(timeoutSeconds) * time.Second,
		ThinkingLevel:   thinkingLevel,
		MaxOutputTokens: maxOutputTokens,
	}

	if !enabled {
		return assistant, nil
	}

	if assistant.GeminiAPIKey == "" {
		return Assistant{}, fmt.Errorf("ASSISTANT_ENABLED is true but GEMINI_API_KEY is empty")
	}

	if assistant.GeminiModel == "" {
		return Assistant{}, fmt.Errorf("ASSISTANT_ENABLED is true but GEMINI_MODEL is empty: set a model included in the Gemini free tier")
	}

	return assistant, nil
}

// loadThinkingLevel acepta minimal, low, medium o high, sin importar
// mayúsculas; vacía es el valor por defecto.
func loadThinkingLevel() (string, error) {
	value := strings.ToUpper(strings.TrimSpace(os.Getenv("ASSISTANT_THINKING_LEVEL")))
	switch value {
	case "":
		return defaultAssistantThinkingLevel, nil
	case "MINIMAL", "LOW", "MEDIUM", "HIGH":
		return value, nil
	default:
		return "", fmt.Errorf("invalid ASSISTANT_THINKING_LEVEL %q: must be minimal, low, medium or high", os.Getenv("ASSISTANT_THINKING_LEVEL"))
	}
}

// loadBool acepta true o false; vacía es false.
func loadBool(key string) (bool, error) {
	switch value := os.Getenv(key); value {
	case "", "false":
		return false, nil
	case "true":
		return true, nil
	default:
		return false, fmt.Errorf("invalid %s %q: must be true or false", key, value)
	}
}

// Comments es la configuración de los comentarios (ADR-022).
type Comments struct {
	// Enabled es false por defecto. Con false, el envío responde 404.
	Enabled bool
	// RateLimitMax envíos por IP cada RateLimitWindow.
	RateLimitMax    int
	RateLimitWindow time.Duration
	// ModerationEnabled enciende la moderación con LLM (ADR-022, punto 4). Es
	// false por defecto: los comentarios llegan a la cola sin análisis.
	ModerationEnabled bool
	// ModerationModel es COMMENTS_MODERATION_MODEL, o gemini-3.6-flash si
	// falta. No cae a GEMINI_MODEL: el modelo del asistente puede ser lento
	// para el timeout de la moderación (gemini-3.8-flash tardaba de 6 a 211 s).
	ModerationModel   string
	ModerationTimeout time.Duration
	// ModerationMaxOutputTokens limita la salida del clasificador, razonamiento
	// incluido. Es propio, separado del asistente: la respuesta es un veredicto,
	// una categoría y una frase.
	ModerationMaxOutputTokens int32
	// GeminiAPIKey es la misma key del asistente (GEMINI_API_KEY).
	GeminiAPIKey Secret
}

// Valores por defecto del límite de envío de comentarios (ADR-022, punto 3).
const (
	defaultCommentsRateLimitMax           = 3
	defaultCommentsRateLimitWindowMinutes = 10
	// defaultCommentsModerationTimeoutSeconds es corto porque el lector espera
	// la respuesta del envío (ADR-022, punto 4).
	defaultCommentsModerationTimeoutSeconds = 10
	// defaultCommentsModerationModel es rápido en el plan gratuito: respondía
	// en 1 a 8 s con razonamiento LOW.
	defaultCommentsModerationModel = "gemini-3.6-flash"
	// defaultCommentsModerationMaxOutputTokens alcanza para el JSON del
	// veredicto (unos 30 tokens) con margen para el razonamiento LOW.
	defaultCommentsModerationMaxOutputTokens = 512
)

// loadComments lee COMMENTS_ENABLED, COMMENTS_RATE_LIMIT_MAX,
// COMMENTS_RATE_LIMIT_WINDOW_MINUTES, COMMENTS_MODERATION_ENABLED,
// COMMENTS_MODERATION_MODEL, COMMENTS_MODERATION_TIMEOUT_SECONDS y
// COMMENTS_MODERATION_MAX_OUTPUT_TOKENS. Con la moderación encendida sin key,
// la API no arranca: falla cerrado, como el asistente.
func loadComments() (Comments, error) {
	enabled, err := loadBool("COMMENTS_ENABLED")
	if err != nil {
		return Comments{}, err
	}

	maxSubmissions, err := positiveInt("COMMENTS_RATE_LIMIT_MAX", defaultCommentsRateLimitMax)
	if err != nil {
		return Comments{}, err
	}

	windowMinutes, err := positiveInt("COMMENTS_RATE_LIMIT_WINDOW_MINUTES", defaultCommentsRateLimitWindowMinutes)
	if err != nil {
		return Comments{}, err
	}

	moderationEnabled, err := loadBool("COMMENTS_MODERATION_ENABLED")
	if err != nil {
		return Comments{}, err
	}

	moderationTimeout, err := positiveInt("COMMENTS_MODERATION_TIMEOUT_SECONDS", defaultCommentsModerationTimeoutSeconds)
	if err != nil {
		return Comments{}, err
	}

	moderationMaxOutput, err := positiveInt32("COMMENTS_MODERATION_MAX_OUTPUT_TOKENS", defaultCommentsModerationMaxOutputTokens)
	if err != nil {
		return Comments{}, err
	}

	moderationModel := strings.TrimSpace(os.Getenv("COMMENTS_MODERATION_MODEL"))
	if moderationModel == "" {
		moderationModel = defaultCommentsModerationModel
	}

	comments := Comments{
		Enabled:                   enabled,
		RateLimitMax:              maxSubmissions,
		RateLimitWindow:           time.Duration(windowMinutes) * time.Minute,
		ModerationEnabled:         moderationEnabled,
		ModerationModel:           moderationModel,
		ModerationTimeout:         time.Duration(moderationTimeout) * time.Second,
		ModerationMaxOutputTokens: moderationMaxOutput,
		GeminiAPIKey:              Secret(os.Getenv("GEMINI_API_KEY")),
	}

	if !moderationEnabled {
		return comments, nil
	}

	if comments.GeminiAPIKey == "" {
		return Comments{}, fmt.Errorf("COMMENTS_MODERATION_ENABLED is true but GEMINI_API_KEY is empty")
	}

	return comments, nil
}
