package handler

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const (
	readyTimeout  = 2 * time.Second
	readyCacheTTL = 5 * time.Second
)

// readiness guarda el resultado del ping durante readyCacheTTL (ADR-011). El
// mutex sigue tomado durante el ping: las peticiones concurrentes esperan ese
// resultado en lugar de lanzar otro ping.
type readiness struct {
	pinger Pinger
	now    func() time.Time

	mu      sync.Mutex
	err     error
	expires time.Time
}

func newReadiness(pinger Pinger, now func() time.Time) *readiness {
	return &readiness{pinger: pinger, now: now}
}

// check devuelve el último resultado vigente. El ping no hereda la cancelación
// de la petición: un cliente que se desconecta no debe dejar en cache un fallo
// que no es de la base de datos.
func (r *readiness) check(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.now().Before(r.expires) {
		return r.err
	}

	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), readyTimeout)
	defer cancel()

	r.err = r.pinger.Ping(ctx)
	r.expires = r.now().Add(readyCacheTTL)

	if r.err != nil {
		slog.ErrorContext(ctx, "readiness check failed", "error", r.err)
	}

	return r.err
}
