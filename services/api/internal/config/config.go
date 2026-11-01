// Package config carga la configuración de la API desde variables de entorno.
package config

import (
	"fmt"
	"os"
	"strconv"
)

const defaultPort = "8080"

// Config es la configuración de la API.
type Config struct {
	Port string
}

// Load lee la configuración del entorno y devuelve un error si no es válida.
func Load() (Config, error) {
	port, err := loadPort()
	if err != nil {
		return Config{}, err
	}

	return Config{Port: port}, nil
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

// required devuelve el valor de una variable obligatoria o un error si falta.
func required(key string) (string, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return "", fmt.Errorf("missing required environment variable %s", key)
	}

	return value, nil
}
