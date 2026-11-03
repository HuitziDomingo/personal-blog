package service

import (
	"sync"
	"time"
)

const (
	// MaxLoginFailures es cuántos logins fallidos admite un email por ventana
	// (ADR-010).
	MaxLoginFailures = 5
	// LoginFailureWindow es la ventana en la que se cuentan los fallos.
	LoginFailureWindow = 15 * time.Minute

	attemptsCleanupInterval = 3 * time.Minute
)

// loginAttempts cuenta los logins fallidos por email en una ventana deslizante.
// Vive en memoria: el límite es por instancia, como el rate limit por IP.
type loginAttempts struct {
	now func() time.Time

	mu          sync.Mutex
	failures    map[string][]time.Time
	lastCleanup time.Time
}

func newLoginAttempts(now func() time.Time) *loginAttempts {
	return &loginAttempts{
		now:         now,
		failures:    make(map[string][]time.Time),
		lastCleanup: now(),
	}
}

// blocked indica si el email agotó sus intentos y cuánto falta para el
// siguiente.
func (a *loginAttempts) blocked(email string) (time.Duration, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := a.now()
	a.cleanup(now)

	recent := a.recent(email, now)
	if len(recent) < MaxLoginFailures {
		return 0, false
	}

	// Se libera un intento cuando el fallo más antiguo sale de la ventana.
	return recent[0].Add(LoginFailureWindow).Sub(now), true
}

// fail registra un login fallido.
func (a *loginAttempts) fail(email string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := a.now()
	a.failures[email] = append(a.recent(email, now), now)
}

// reset borra los fallos tras un login correcto.
func (a *loginAttempts) reset(email string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	delete(a.failures, email)
}

// recent devuelve los fallos del email que siguen dentro de la ventana, en
// orden, y guarda solo esos. Se llama con el mutex tomado.
func (a *loginAttempts) recent(email string, now time.Time) []time.Time {
	failures := a.failures[email]

	first := 0
	for first < len(failures) && now.Sub(failures[first]) >= LoginFailureWindow {
		first++
	}

	failures = failures[first:]
	if len(failures) == 0 {
		delete(a.failures, email)

		return nil
	}

	a.failures[email] = failures

	return failures
}

// cleanup borra cada cierto tiempo los emails sin fallos recientes, para que el
// mapa no crezca con emails que nadie vuelve a intentar.
func (a *loginAttempts) cleanup(now time.Time) {
	if now.Sub(a.lastCleanup) < attemptsCleanupInterval {
		return
	}

	for email := range a.failures {
		a.recent(email, now)
	}

	a.lastCleanup = now
}

func (a *loginAttempts) size() int {
	a.mu.Lock()
	defer a.mu.Unlock()

	return len(a.failures)
}
