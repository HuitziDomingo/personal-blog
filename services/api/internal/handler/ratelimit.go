package handler

import (
	"fmt"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/service"
)

const (
	apiPathPrefix     = "/api/v1/"
	loginPath         = "/api/v1/auth/login"
	refreshPath       = "/api/v1/auth/refresh"
	detailRateLimited = "rate limit exceeded"

	// Una clave inactiva se olvida tras minIdleTTL, o tras lo que tarde su bucket en
	// llenarse si es más: olvidarla antes le regalaría tokens.
	minIdleTTL      = 5 * time.Minute
	cleanupInterval = 3 * time.Minute

	ipv6PrefixBits = 64
)

// RateLimit es un límite por clave (IP o usuario): PerMinute tokens por minuto
// y hasta Burst acumulados.
type RateLimit struct {
	PerMinute int
	Burst     int
}

// RateLimits son los límites de ADR-010 y ADR-016.
type RateLimits struct {
	// Global es por IP, para /api/v1 sin un access token válido.
	Global  RateLimit
	Login   RateLimit
	Refresh RateLimit
	// Preflight es por IP, solo para los preflight CORS.
	Preflight RateLimit
	// User es por usuario, para /api/v1 con un access token válido.
	User RateLimit
	// Assistant es por usuario, solo para el asistente de escritura y además
	// de User (ADR-021).
	Assistant RateLimit
}

// accessVerifier valida un access token con las reglas de ADR-011 y devuelve
// sus claims; es Sessions.Authenticate.
type accessVerifier func(accessToken string) (service.AccessClaims, error)

// visitor es el bucket de una clave.
type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// keyedLimiter guarda un token bucket por clave: una IP o un usuario. Un solo
// mutex protege el mapa: crear un bucket, marcar su uso y barrer los inactivos
// son operaciones compuestas.
type keyedLimiter struct {
	limit   rate.Limit
	burst   int
	idleTTL time.Duration
	now     func() time.Time

	mu          sync.Mutex
	visitors    map[string]*visitor
	lastCleanup time.Time
}

func newKeyedLimiter(limit RateLimit, now func() time.Time) *keyedLimiter {
	perSecond := rate.Limit(float64(limit.PerMinute) / time.Minute.Seconds())
	fill := time.Duration(float64(limit.Burst) / float64(perSecond) * float64(time.Second))

	return &keyedLimiter{
		limit:       perSecond,
		burst:       limit.Burst,
		idleTTL:     max(minIdleTTL, fill),
		now:         now,
		visitors:    make(map[string]*visitor),
		lastCleanup: now(),
	}
}

// allow consume un token de la clave. Si no hay, devuelve cuánto falta para el
// siguiente.
func (l *keyedLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.cleanup(now)

	current, ok := l.visitors[key]
	if !ok {
		current = &visitor{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[key] = current
	}

	current.lastSeen = now

	reservation := current.limiter.ReserveN(now, 1)
	if delay := reservation.DelayFrom(now); delay > 0 {
		reservation.CancelAt(now)

		return false, delay
	}

	return true, 0
}

// cleanup borra las claves inactivas cada cleanupInterval. Corre dentro de allow,
// así que no necesita una goroutine ni una forma de detenerla.
func (l *keyedLimiter) cleanup(now time.Time) {
	if now.Sub(l.lastCleanup) < cleanupInterval {
		return
	}

	for key, current := range l.visitors {
		if now.Sub(current.lastSeen) >= l.idleTTL {
			delete(l.visitors, key)
		}
	}

	l.lastCleanup = now
}

func (l *keyedLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()

	return len(l.visitors)
}

// rateLimiter aplica a /api/v1 el límite por usuario o el global por IP, uno
// extra por IP a login y refresh, uno extra por usuario al asistente y uno
// propio por IP a los preflight CORS.
type rateLimiter struct {
	global     *keyedLimiter
	login      *keyedLimiter
	refresh    *keyedLimiter
	preflights *keyedLimiter
	users      *keyedLimiter
	assistant  *keyedLimiter
	verify     accessVerifier
}

// validate rechaza un límite sin configurar: con cero tokens, cada petición
// de su bucket recibiría 429.
func (limits RateLimits) validate() error {
	for name, limit := range map[string]RateLimit{
		"global": limits.Global, "login": limits.Login, "refresh": limits.Refresh,
		"preflight": limits.Preflight, "user": limits.User, "assistant": limits.Assistant,
	} {
		if limit.PerMinute <= 0 || limit.Burst <= 0 {
			return fmt.Errorf("%s rate limit must be positive: %+v", name, limit)
		}
	}

	return nil
}

func newRateLimiter(limits RateLimits, verify accessVerifier, now func() time.Time) *rateLimiter {
	return &rateLimiter{
		global:     newKeyedLimiter(limits.Global, now),
		login:      newKeyedLimiter(limits.Login, now),
		refresh:    newKeyedLimiter(limits.Refresh, now),
		preflights: newKeyedLimiter(limits.Preflight, now),
		users:      newKeyedLimiter(limits.User, now),
		assistant:  newKeyedLimiter(limits.Assistant, now),
		verify:     verify,
	}
}

// isCORSPreflight es un preflight que crossOrigin responde: con Origin. Sin
// Origin no es de un navegador, crossOrigin lo deja pasar y gasta el global.
func isCORSPreflight(request *http.Request) bool {
	return isPreflight(request) && request.Header.Get("Origin") != ""
}

// preflight limita los preflight CORS de cualquier ruta con su propio bucket
// por IP. Va antes de crossOrigin, que los responde sin llegar a handle.
func (r *rateLimiter) preflight(c *gin.Context) {
	if !isCORSPreflight(c.Request) {
		return
	}

	admit(c, r.preflights, clientKey(c.ClientIP()))
}

func (r *rateLimiter) handle(c *gin.Context) {
	path := c.Request.URL.Path
	// Un preflight CORS ya pasó por su bucket. crossOrigin lo responde y no
	// llega aquí; la comprobación lo garantiza aunque cambie el orden.
	if !strings.HasPrefix(path, apiPathPrefix) || isCORSPreflight(c.Request) {
		return
	}

	ip := clientKey(c.ClientIP())
	limiter, key := r.global, ip
	userID, authenticated := r.authenticatedUser(c)
	if authenticated {
		limiter, key = r.users, userID
	}

	if !admit(c, limiter, key) {
		return
	}

	// Sin sesión, la operación responde 401 sin llegar al proveedor: basta
	// el bucket global.
	if authenticated && strings.HasPrefix(path, assistantPathPrefix) {
		admit(c, r.assistant, userID)

		return
	}

	if c.Request.Method != http.MethodPost {
		return
	}

	switch path {
	case loginPath:
		admit(c, r.login, ip)
	case refreshPath:
		admit(c, r.refresh, ip)
	}
}

// authenticatedUser devuelve el usuario de un access token válido. Un token
// inválido, vencido o ausente da false: nunca más cupo que el de su IP. No
// sustituye a la autenticación de las rutas protegidas (ADR-016).
func (r *rateLimiter) authenticatedUser(c *gin.Context) (string, bool) {
	token, err := c.Cookie(accessCookieName)
	if err != nil || token == "" {
		return "", false
	}

	claims, err := r.verify(token)
	if err != nil || claims.UserID == "" {
		return "", false
	}

	return claims.UserID, true
}

func admit(c *gin.Context, limiter *keyedLimiter, key string) bool {
	ok, delay := limiter.allow(key)
	if ok {
		return true
	}

	c.Header("Retry-After", strconv.Itoa(retryAfterSeconds(delay)))
	writeProblem(c, http.StatusTooManyRequests, detailRateLimited)

	return false
}

// retryAfterSeconds redondea hacia arriba: Retry-After solo acepta segundos
// enteros, y redondear hacia abajo invitaría a reintentar demasiado pronto.
func retryAfterSeconds(delay time.Duration) int {
	return max(1, int(math.Ceil(delay.Seconds())))
}

// clientKey agrupa IPv6 por su prefijo /64, que suele ser de un solo cliente:
// por dirección, un cliente podría rotar entre 2^64 direcciones.
func clientKey(clientIP string) string {
	ip := net.ParseIP(clientIP)
	if ip == nil || ip.To4() != nil {
		return clientIP
	}

	return ip.Mask(net.CIDRMask(ipv6PrefixBits, 8*net.IPv6len)).String() + "/64"
}
