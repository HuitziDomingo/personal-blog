# Roadmap y Backlog del Proyecto (huitzi.xyz)

## Fase 1: Setup del Monorepo e Infraestructura Local

- [ ] BLOG-001: Configurar `pnpm workspaces` para `apps/web` y `apps/admin`.
- [ ] BLOG-002: Crear `go.mod` en `services/api`.
- [ ] BLOG-003: Crear el `Makefile` raíz con comandos `dev`, `test`, `build` y `lint`.
- [ ] BLOG-004: Crear `docker-compose.yml` para MongoDB local (`mongo:8.0`) en el puerto 27017.
- [ ] BLOG-005: Crear `.env.example` con variables de entorno para desarrollo local.
- [ ] BLOG-006: Crear endpoint `GET /health`.
- [ ] BLOG-007: Configurar `.github/workflows/api.yml` con build, vet, golangci-lint y test.

## Fase 2: Backend API (Go/Gin) & Autenticación

- [ ] BLOG-008: Definir estructuras de Dominio (`domain/user.go`, `domain/post.go`, `domain/errors.go`).
- [ ] BLOG-009: Implementar repositorio de MongoDB con el driver oficial `v2` (`go.mongodb.org/mongo-driver/v2`).
- [ ] BLOG-010: Bootstrap automático del admin al arrancar si `users` está vacía (ADR-005).
- [ ] BLOG-011: Crear endpoints de autenticación (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`).
- [ ] BLOG-012: Implementar middleware de JWT y almacenamiento en Cookie `HttpOnly`.
- [ ] BLOG-027: Escribir ADR-007: contrato de API.
- [ ] BLOG-013: Generar el contrato OpenAPI (depende de BLOG-027).
- [ ] BLOG-014: Crear colección de pruebas en Bruno (vía MCP).

## Fase 3: Dashboard de Administración (Angular + Spartan UI)

- [ ] BLOG-015: Configurar proyecto Angular en `apps/admin` con Tailwind CSS y Spartan UI.
- [ ] BLOG-016: Crear servicio de Autenticación y `AuthGuard` para rutas protegidas.
- [ ] BLOG-017: Diseñar layout principal con estilo Liquid Glass / Glassmorphism.
- [ ] BLOG-018: Crear vista de gestión y creación de posts (Editor Markdown).

## Fase 4: Testing & CI/CD Pipeline

- [ ] BLOG-019: Implementar pruebas unitarias en Go para servicios y handlers (`testify` + mocks).
- [ ] BLOG-020: Implementar pruebas unitarias de componentes/servicios en Angular (`Vitest`).
- [ ] BLOG-021: Configurar GitHub Actions por ruta (`.github/workflows/admin.yml`, `web.yml`).
- [ ] BLOG-022: Configurar pipeline de despliegue de la API a GCP Cloud Run.

## Fase futura (fuera del MVP)

- [ ] BLOG-023: Definir `domain/comment.go` e implementar comentarios.
- [ ] BLOG-024: Crear vista de moderación de comentarios.
- [ ] BLOG-025: Agregar `AIModeration` a la moderación de comentarios.
- [ ] BLOG-026: Agregar `AgentSummary` a los posts.
