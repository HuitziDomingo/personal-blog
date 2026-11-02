# Roadmap y Backlog del Proyecto (huitzi.xyz)

## Fase 1: Setup del Monorepo e Infraestructura Local

- [x] BLOG-001: Configurar `pnpm workspaces` para `apps/web` y `apps/admin`. ([#10](https://github.com/HuitziDomingo/personal-blog/pull/10))
- [x] BLOG-002: Crear `go.mod` en `services/api`. ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))
- [ ] BLOG-003: Crear el `Makefile` raíz con comandos `dev`, `test`, `build` y `lint`.
- [x] BLOG-004: Crear `docker-compose.yml` para MongoDB local (`mongo:8.0`) en el puerto 27017. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [x] BLOG-005: Crear `.env.example` con variables de entorno para desarrollo local. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [x] BLOG-006: Crear endpoint `GET /health`. ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))
- [x] BLOG-007: Configurar `.github/workflows/ci.yml` con build, vet, golangci-lint y test (ADR-008). ([#5](https://github.com/HuitziDomingo/personal-blog/pull/5))

## Fase 2: Backend API (Go/Gin) & Autenticación

- [x] BLOG-008: Definir estructuras de Dominio (`domain/user.go`, `domain/post.go`, `domain/errors.go`). ([#8](https://github.com/HuitziDomingo/personal-blog/pull/8))
- [ ] BLOG-009: Implementar repositorio de MongoDB con el driver oficial `v2` (`go.mongodb.org/mongo-driver/v2`).
- [x] BLOG-028: Conectar la API a MongoDB y crear endpoint `GET /ready`. ([#6](https://github.com/HuitziDomingo/personal-blog/pull/6))
- [ ] BLOG-010: Bootstrap automático del admin al arrancar si `users` está vacía (ADR-005).
- [x] BLOG-027: Escribir ADR-007: contrato de API. ([#9](https://github.com/HuitziDomingo/personal-blog/pull/9))
- [x] BLOG-029: Escribir `docs/api/openapi.yaml` inicial: auth (login, refresh, logout) y posts. ([#11](https://github.com/HuitziDomingo/personal-blog/pull/11))
- [ ] BLOG-013: Configurar generación con oapi-codegen (Go) y openapi-typescript (TS) con check de drift en CI.
- [ ] BLOG-030: Implementar handler propio de errores `application/problem+json` para el validador y los tres manejadores de strict-server (`RequestErrorHandlerFunc`, `HandlerErrorFunc`, `ResponseErrorHandlerFunc`).
- [ ] BLOG-011: Crear endpoints de autenticación (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`).
- [ ] BLOG-012: Implementar middleware de JWT y almacenamiento en Cookie `HttpOnly`.
- [ ] BLOG-014: Crear colección de pruebas en Bruno (vía MCP).

## Fase 3: Dashboard de Administración (Angular + Spartan UI)

- [ ] BLOG-015: Configurar proyecto Angular en `apps/admin` con Tailwind CSS y Spartan UI.
- [ ] BLOG-016: Crear servicio de Autenticación y `AuthGuard` para rutas protegidas.
- [ ] BLOG-017: Diseñar layout principal con estilo Liquid Glass / Glassmorphism.
- [ ] BLOG-018: Crear vista de gestión y creación de posts (Editor Markdown).

## Fase 4: Testing & CI/CD Pipeline

- [ ] BLOG-019: Implementar pruebas unitarias en Go para servicios y handlers (`testify` + mocks).
- [ ] BLOG-020: Implementar pruebas unitarias de componentes/servicios en Angular (`Vitest`).
- [ ] BLOG-021: Agregar jobs admin y web a ci.yml con su filtro en el job changes (ADR-008).
- [ ] BLOG-022: Configurar pipeline de despliegue de la API a GCP Cloud Run.

## Por definir

- Falta una tarea que cree `apps/web`; todavía no tiene ID.

## Fase futura (fuera del MVP)

- [ ] BLOG-023: Definir `domain/comment.go` e implementar comentarios.
- [ ] BLOG-024: Crear vista de moderación de comentarios.
- [ ] BLOG-025: Agregar `AIModeration` a la moderación de comentarios.
- [ ] BLOG-026: Agregar `AgentSummary` a los posts.
