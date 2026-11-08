// Package config carga la configuración de la API desde variables de entorno.
package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	// MinJWTSecretBytes es el tamaño mínimo del secreto de los JWT (ADR-010).
	MinJWTSecretBytes = 32

	defaultPort         = "8080"
	defaultMaxBodyBytes = 1 << 20 // 1 MB

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
// refresh) y de ADR-016 (preflight y usuario autenticado).
var rateLimitSpecs = [...]rateLimitSpec{
	{name: "GLOBAL", defaults: RateLimit{PerMinute: 60, Burst: 20}},
	{name: "LOGIN", defaults: RateLimit{PerMinute: 5, Burst: 5}},
	{name: "REFRESH", defaults: RateLimit{PerMinute: 10, Burst: 10}},
	{name: "PREFLIGHT", defaults: RateLimit{PerMinute: 120, Burst: 60}},
	{name: "USER", defaults: RateLimit{PerMinute: 300, Burst: 100}},
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
