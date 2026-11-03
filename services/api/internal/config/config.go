// Package config carga la configuración de la API desde variables de entorno.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	defaultPort         = "8080"
	defaultMaxBodyBytes = 1 << 20 // 1 MB
)

// Config es la configuración de la API.
type Config struct {
	Port        string
	MongoURI    string
	MongoDBName string

	AllowedOrigins []string
	MaxBodyBytes   int64

	// Opcionales: solo se usan para crear el administrador inicial.
	InitialAdminEmail    string
	InitialAdminPassword string
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

	allowedOrigins, err := loadAllowedOrigins()
	if err != nil {
		return Config{}, err
	}

	maxBodyBytes, err := loadMaxBodyBytes()
	if err != nil {
		return Config{}, err
	}

	return Config{
		Port:                 port,
		MongoURI:             mongoURI,
		MongoDBName:          mongoDBName,
		AllowedOrigins:       allowedOrigins,
		MaxBodyBytes:         maxBodyBytes,
		InitialAdminEmail:    os.Getenv("INITIAL_ADMIN_EMAIL"),
		InitialAdminPassword: os.Getenv("INITIAL_ADMIN_PASSWORD"),
	}, nil
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

// required devuelve el valor de una variable obligatoria o un error si falta.
func required(key string) (string, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return "", fmt.Errorf("missing required environment variable %s", key)
	}

	return value, nil
}
