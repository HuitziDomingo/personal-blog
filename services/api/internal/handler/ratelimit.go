package handler

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

const (
	apiPathPrefix     = "/api/v1/"
	loginPath         = "/api/v1/auth/login"
	refreshPath       = "/api/v1/auth/refresh"
	detailRateLimited = "rate limit exceeded"

	// Una IP inactiva se olvida tras minIdleTTL, o tras lo que tarde su bucket en
	// llenarse si es más: olvidarla antes le regalaría tokens.
	minIdleTTL      = 5 * time.Minute
	cleanupInterval = 3 * time.Minute

	ipv6PrefixBits = 64
)

// RateLimit es un límite por IP: PerMinute tokens por minuto y hasta Burst
// acumulados.
type RateLimit struct {
	PerMinute int
	Burst     int
}

// RateLimits son los límites de ADR-010.
type RateLimits struct {
	Global  RateLimit
	Login   RateLimit
	Refresh RateLimit
}

// visitor es el bucket de una IP.
type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// ipLimiter guarda un token bucket por IP. Un solo mutex protege el mapa: crear
// un bucket, marcar su uso y barrer los inactivos son operaciones compuestas.
type ipLimiter struct {
	limit   rate.Limit
	burst   int
	idleTTL time.Duration
	now     func() time.Time

	mu          sync.Mutex
	visitors    map[string]*visitor
	lastCleanup time.Time
}

func newIPLimiter(limit RateLimit, now func() time.Time) *ipLimiter {
	perSecond := rate.Limit(float64(limit.PerMinute) / time.Minute.Seconds())
	fill := time.Duration(float64(limit.Burst) / float64(perSecond) * float64(time.Second))

	return &ipLimiter{
		limit:       perSecond,
		burst:       limit.Burst,
		idleTTL:     max(minIdleTTL, fill),
		now:         now,
		visitors:    make(map[string]*visitor),
		lastCleanup: now(),
	}
}

// allow consume un token de la IP. Si no hay, devuelve cuánto falta para el
// siguiente.
func (l *ipLimiter) allow(key string) (bool, time.Duration) {
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

// cleanup borra las IP inactivas cada cleanupInterval. Corre dentro de allow,
// así que no necesita una goroutine ni una forma de detenerla.
func (l *ipLimiter) cleanup(now time.Time) {
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

func (l *ipLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()

	return len(l.visitors)
}

// rateLimiter aplica el límite global a /api/v1 y uno extra a login y refresh.
type rateLimiter struct {
	global  *ipLimiter
	login   *ipLimiter
	refresh *ipLimiter
}

func newRateLimiter(limits RateLimits, now func() time.Time) *rateLimiter {
	return &rateLimiter{
		global:  newIPLimiter(limits.Global, now),
		login:   newIPLimiter(limits.Login, now),
		refresh: newIPLimiter(limits.Refresh, now),
	}
}

func (r *rateLimiter) handle(c *gin.Context) {
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, apiPathPrefix) {
		return
	}

	key := clientKey(c.ClientIP())
	if !admit(c, r.global, key) {
		return
	}

	if c.Request.Method != http.MethodPost {
		return
	}

	switch path {
	case loginPath:
		admit(c, r.login, key)
	case refreshPath:
		admit(c, r.refresh, key)
	}
}

func admit(c *gin.Context, limiter *ipLimiter, key string) bool {
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
