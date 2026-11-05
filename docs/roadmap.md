# Roadmap y Backlog del Proyecto (huitzi.xyz)

## Fase 1: Setup del Monorepo e Infraestructura Local

- [x] BLOG-001: Configurar `pnpm workspaces` para `apps/web` y `apps/admin`. ([#10](https://github.com/HuitziDomingo/personal-blog/pull/10))
- [x] BLOG-002: Crear `go.mod` en `services/api`. ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))
- [ ] BLOG-003: Crear el `Makefile` raíz con comandos `dev`, `test`, `build` y `lint`.
- [x] BLOG-004: Crear `docker-compose.yml` para MongoDB local (`mongo:8.0`) en el puerto 27017. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [x] BLOG-005: Crear `.env.example` con variables de entorno para desarrollo local. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [x] BLOG-006: Crear endpoint `GET /health`. ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))
- [x] BLOG-007: Configurar `.github/workflows/ci.yml` con build, vet, golangci-lint y test (ADR-008). ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))
- [x] BLOG-038: Escribir la guía de desarrollo en `docs/development.md`. ([#20](https://github.com/HuitziDomingo/personal-blog/pull/20))

## Fase 2: Backend API (Go/Gin) & Autenticación

- [x] BLOG-008: Definir estructuras de Dominio (`domain/user.go`, `domain/post.go`, `domain/errors.go`). ([#8](https://github.com/HuitziDomingo/personal-blog/pull/8))
- [x] BLOG-009: Implementar repositorio de usuarios en MongoDB con el driver oficial `v2` (`go.mongodb.org/mongo-driver/v2`). ([#15](https://github.com/HuitziDomingo/personal-blog/pull/15))
- [x] BLOG-028: Conectar la API a MongoDB y crear endpoint `GET /ready`. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [x] BLOG-010: Bootstrap automático del admin al arrancar si `users` está vacía (ADR-005). ([#17](https://github.com/HuitziDomingo/personal-blog/pull/17))
- [x] BLOG-027: Escribir ADR-007: contrato de API. ([#9](https://github.com/HuitziDomingo/personal-blog/pull/9))
- [x] BLOG-029: Escribir `docs/api/openapi.yaml` inicial: auth (login, refresh, logout) y posts. ([#11](https://github.com/HuitziDomingo/personal-blog/pull/11))
- [x] BLOG-013: Configurar generación con oapi-codegen (Go) y openapi-typescript (TS) con check de drift en CI. ([#12](https://github.com/HuitziDomingo/personal-blog/pull/12))
- [x] BLOG-030: Implementar handler propio de errores `application/problem+json` para el validador y los tres manejadores de strict-server (`RequestErrorHandlerFunc`, `HandlerErrorFunc`, `ResponseErrorHandlerFunc`). ([#14](https://github.com/HuitziDomingo/personal-blog/pull/14))
- [x] BLOG-034: Implementar el middleware de seguridad de ADR-010: rate limit global y de auth, cabeceras, `MaxBytesReader`, proxies confiables y verificación de `Origin`. ([#24](https://github.com/HuitziDomingo/personal-blog/pull/24), [#25](https://github.com/HuitziDomingo/personal-blog/pull/25), [#26](https://github.com/HuitziDomingo/personal-blog/pull/26))
- [ ] BLOG-035: Declarar el `maximum` de paginación en `openapi.yaml` (ADR-010): `limit` ya lo tiene, falta `offset`.
- [x] BLOG-039: Implementar CORS con allowlist de orígenes (ADR-005 y ADR-010). ([#24](https://github.com/HuitziDomingo/personal-blog/pull/24))
- [x] BLOG-040: Cachear durante 5 segundos el ping a MongoDB de `GET /ready` (ADR-011). ([#24](https://github.com/HuitziDomingo/personal-blog/pull/24))
- [x] BLOG-011: Crear endpoints de autenticación (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`), con límite de intentos fallidos por email en el login (ADR-010). ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-044: Agregar GET /api/v1/auth/me al contrato y a la API (ADR-012). ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-012: Implementar middleware de JWT y almacenamiento en Cookie `HttpOnly`. ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-053: Exponer `Retry-After` a los orígenes permitidos con `Access-Control-Expose-Headers`, para que el admin muestre el tiempo de espera de un 429. ([#39](https://github.com/HuitziDomingo/personal-blog/pull/39))
- [x] BLOG-032: Implementar `PostRepository` en MongoDB, con índices idempotentes y tests de integración. ([#42](https://github.com/HuitziDomingo/personal-blog/pull/42))
- [x] BLOG-055: Implementar el service de posts (`internal/service`) con las reglas de negocio: slug, `PublishedAt`, archivado, tags y extracto. ([#43](https://github.com/HuitziDomingo/personal-blog/pull/43))
- [ ] BLOG-056: Implementar los endpoints públicos y de admin de posts, con su flujo de Bruno en `flows/posts/`.
- [x] BLOG-014: Crear colección de pruebas en Bruno, generada desde el contrato con el CLI de Bruno, con flujos manuales. ([#31](https://github.com/HuitziDomingo/personal-blog/pull/31))

## Fase 3: Dashboard de Administración (Angular + Spartan UI)

- [x] BLOG-015: Configurar proyecto Angular en `apps/admin` con Tailwind CSS y Spartan UI, según ADR-012. ([#33](https://github.com/HuitziDomingo/personal-blog/pull/33))
- [x] BLOG-016: Crear servicio de Autenticación y `AuthGuard` para rutas protegidas. ([#40](https://github.com/HuitziDomingo/personal-blog/pull/40))
- [x] BLOG-045: Interceptor de credenciales y refresh single-flight con tests (ADR-012). ([#40](https://github.com/HuitziDomingo/personal-blog/pull/40))
- [ ] BLOG-017: Diseñar layout principal con estilo Liquid Glass / Glassmorphism.
- [ ] BLOG-018: Crear vista de gestión y creación de posts (Editor Markdown).
- [ ] BLOG-036: Sanitizar el Markdown de los posts al renderizar en `apps/web` y `apps/admin`, con allowlist (ADR-010).
- [x] BLOG-046: CSP y cabeceras del admin en Vercel (ADR-012). ([#45](https://github.com/HuitziDomingo/personal-blog/pull/45))
- [ ] BLOG-047: Configurar admin.huitzi.xyz en Vercel y DNS en DreamHost. El build command de Vercel debe ser el script `build` del paquete (`pnpm --filter @personal-blog/admin build`), que corre el chequeo de la URL de la API, no `ng build` directo.
- [x] BLOG-050: Activar security.autoCsp en angular.json (va con BLOG-046). ([#45](https://github.com/HuitziDomingo/personal-blog/pull/45))
- [x] BLOG-051: API_BASE_URL del admin desde la configuración de build, no fijo en localhost (antes de BLOG-047). ([#41](https://github.com/HuitziDomingo/personal-blog/pull/41))

## Fase 4: Testing & CI/CD Pipeline

- [ ] BLOG-019: Implementar pruebas unitarias en Go para servicios y handlers (`testify` + mocks).
- [ ] BLOG-020: Implementar pruebas unitarias de componentes/servicios en Angular (`Vitest`).
- [x] BLOG-021: Job admin en ci.yml (ADR-014). ([#34](https://github.com/HuitziDomingo/personal-blog/pull/34))
- [ ] BLOG-052: Job web en ci.yml con su filtro en el job changes, cuando exista `apps/web` (ADR-014).
- [x] BLOG-049: Incluir Makefile y scripts de generación en el filtro del job api (va en el ADR de BLOG-021). ([#34](https://github.com/HuitziDomingo/personal-blog/pull/34))
- [x] BLOG-037: Crear el `Dockerfile` multi-stage de la API y compilarlo en CI, sin publicar la imagen (ADR-004). ([#19](https://github.com/HuitziDomingo/personal-blog/pull/19))
- [ ] BLOG-054: ADR de despliegue: Cloud Run, dominio de la API (api.huitzi.xyz) y certificados.
- [ ] BLOG-022: Configurar pipeline de despliegue de la API a GCP Cloud Run.
- [ ] BLOG-041: Verificar en el primer despliegue: rango de proxies, Cache-Control y cookies bajo api.huitzi.xyz.
- [ ] BLOG-031: Revisar las 3 vulnerabilidades de `govulncheck` en módulos requeridos.
- [x] BLOG-042: Configurar Dependabot con version updates semanales (ADR-010). ([#22](https://github.com/HuitziDomingo/personal-blog/pull/22))
- [x] BLOG-043: Activar JavaScript/TypeScript en CodeQL (Settings → Advanced Security) cuando se mergee el primer código de apps/admin o apps/web. (Activado en Settings; `Analyze (javascript-typescript)` corre desde [#34](https://github.com/HuitziDomingo/personal-blog/pull/34))
- [ ] BLOG-033: Volver el job api a ubuntu-latest cuando su kernel sea compatible con MongoDB 8 (SERVER-121912).
- [x] BLOG-048: ADR de política de dependencias: edad mínima de versiones con pnpm minimumReleaseAge y cooldown en Dependabot. ([#32](https://github.com/HuitziDomingo/personal-blog/pull/32))

## Por definir

- Falta una tarea que cree `apps/web`; todavía no tiene ID.

## Fase futura (fuera del MVP)

- [ ] BLOG-023: Definir `domain/comment.go` e implementar comentarios.
- [ ] BLOG-024: Crear vista de moderación de comentarios.
- [ ] BLOG-025: Agregar `AIModeration` a la moderación de comentarios.
- [ ] BLOG-026: Agregar `AgentSummary` a los posts.
