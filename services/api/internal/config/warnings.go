package config

import (
	"fmt"
	"net/url"
	"strings"
)

// minUsefulBodyBytes es el MAX_BODY_BYTES por debajo del cual un post largo ya
// no cabe: el contrato no limita el largo del contenido, así que este tope es
// el único.
const minUsefulBodyBytes = 64 << 10 // 64 KiB

// Warnings devuelve los avisos de una configuración válida pero que deja la API
// funcionando a medias: arranca, pero algo que se espera no va a funcionar.
// Los mensajes nunca incluyen valores secretos.
func (c Config) Warnings() []string {
	var warnings []string

	if len(c.AllowedOrigins) == 0 {
		warnings = append(warnings, "ALLOWED_ORIGINS is empty: no browser can log in or change state, because CORS and the Origin check reject every origin; set it to the admin origin, e.g. http://localhost:4200")
	}

	for _, origin := range c.AllowedOrigins {
		if canonical := canonicalOrigin(origin); canonical != origin {
			warnings = append(warnings, fmt.Sprintf("ALLOWED_ORIGINS entry %q never matches: browsers send the Origin header as %q", origin, canonical))
		}
	}

	switch {
	case c.InitialAdminEmail != "" && c.InitialAdminPassword == "":
		warnings = append(warnings, "INITIAL_ADMIN_EMAIL is set but INITIAL_ADMIN_PASSWORD is empty: the initial admin will not be created")
	case c.InitialAdminEmail == "" && c.InitialAdminPassword != "":
		warnings = append(warnings, "INITIAL_ADMIN_PASSWORD is set but INITIAL_ADMIN_EMAIL is empty: the initial admin will not be created")
	}

	if c.MaxBodyBytes < minUsefulBodyBytes {
		warnings = append(warnings, fmt.Sprintf("MAX_BODY_BYTES is %d bytes: creating or editing a post larger than that fails with 413", c.MaxBodyBytes))
	}

	if c.GinMode == GinModeRelease && len(c.TrustedProxies) == 0 {
		warnings = append(warnings, "TRUSTED_PROXIES is empty in release mode: behind a proxy such as Cloud Run every client shares the proxy IP, and with it the rate limits")
	}

	if c.LogFormat == LogFormatJSON && c.GinMode == GinModeDebug {
		warnings = append(warnings, "GIN_MODE=debug with LOG_FORMAT=json: Gin writes its debug output as plain text between the JSON lines; use GIN_MODE=release")
	}

	return warnings
}

// canonicalOrigin es el origen como lo envía un navegador en la cabecera
// Origin: esquema y host en minúsculas, y sin el puerto por defecto. La API
// compara los orígenes de forma exacta, así que cualquier otra forma no
// coincide nunca.
func canonicalOrigin(origin string) string {
	parsed, err := url.Parse(origin)
	if err != nil {
		return origin
	}

	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Hostname())
	port := parsed.Port()

	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		port = ""
	}

	if port != "" {
		host += ":" + port
	}

	return scheme + "://" + host
}
