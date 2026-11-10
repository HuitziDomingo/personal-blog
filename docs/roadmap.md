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
- [x] BLOG-063: `make api-watch` con Air como herramienta de Go: recompila y reinicia la API al guardar, respetando el graceful shutdown. ([#57](https://github.com/HuitziDomingo/personal-blog/pull/57))
- [x] BLOG-082: `.claude/settings.json` del repo con `deny` para `git reset --hard` y `git clean`, y `ask` para `git push --force` y `git push -f`. ([#72](https://github.com/HuitziDomingo/personal-blog/pull/72), [#74](https://github.com/HuitziDomingo/personal-blog/pull/74))

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
- [x] BLOG-035: Declarar el `maximum` de paginación en `openapi.yaml` (ADR-010): `limit` ya lo tiene, falta `offset`. ([#44](https://github.com/HuitziDomingo/personal-blog/pull/44))
- [x] BLOG-039: Implementar CORS con allowlist de orígenes (ADR-005 y ADR-010). ([#24](https://github.com/HuitziDomingo/personal-blog/pull/24))
- [x] BLOG-040: Cachear durante 5 segundos el ping a MongoDB de `GET /ready` (ADR-011). ([#24](https://github.com/HuitziDomingo/personal-blog/pull/24))
- [x] BLOG-011: Crear endpoints de autenticación (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`), con límite de intentos fallidos por email en el login (ADR-010). ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-044: Agregar GET /api/v1/auth/me al contrato y a la API (ADR-012). ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-012: Implementar middleware de JWT y almacenamiento en Cookie `HttpOnly`. ([#29](https://github.com/HuitziDomingo/personal-blog/pull/29))
- [x] BLOG-053: Exponer `Retry-After` a los orígenes permitidos con `Access-Control-Expose-Headers`, para que el admin muestre el tiempo de espera de un 429. ([#39](https://github.com/HuitziDomingo/personal-blog/pull/39))
- [x] BLOG-032: Implementar `PostRepository` en MongoDB, con índices idempotentes y tests de integración. ([#42](https://github.com/HuitziDomingo/personal-blog/pull/42))
- [x] BLOG-055: Implementar el service de posts (`internal/service`) con las reglas de negocio: slug, `PublishedAt`, archivado, tags y extracto. ([#43](https://github.com/HuitziDomingo/personal-blog/pull/43))
- [x] BLOG-056: Implementar los endpoints públicos y de admin de posts, con su flujo de Bruno en `flows/posts/`. ([#44](https://github.com/HuitziDomingo/personal-blog/pull/44))
- [x] BLOG-014: Crear colección de pruebas en Bruno, generada desde el contrato con el CLI de Bruno, con flujos manuales. ([#31](https://github.com/HuitziDomingo/personal-blog/pull/31))
- [x] BLOG-064: Rate limit por usuario autenticado y bucket propio para el preflight CORS (ADR-016), con los límites por defecto en los E2E. ([#59](https://github.com/HuitziDomingo/personal-blog/pull/59))
- [x] BLOG-060: Avisos al arrancar por configuración inútil (`ALLOWED_ORIGINS` vacía y otras), logs JSON para Cloud Logging con `LOG_FORMAT` y `GIN_MODE` según el entorno. ([#54](https://github.com/HuitziDomingo/personal-blog/pull/54))

## Fase 3: Dashboard de Administración (Angular + Spartan UI)

- [x] BLOG-015: Configurar proyecto Angular en `apps/admin` con Tailwind CSS y Spartan UI, según ADR-012. ([#33](https://github.com/HuitziDomingo/personal-blog/pull/33))
- [x] BLOG-016: Crear servicio de Autenticación y `AuthGuard` para rutas protegidas. ([#40](https://github.com/HuitziDomingo/personal-blog/pull/40))
- [x] BLOG-045: Interceptor de credenciales y refresh single-flight con tests (ADR-012). ([#40](https://github.com/HuitziDomingo/personal-blog/pull/40))
- [x] BLOG-017: Diseñar layout principal: menú lateral u offcanvas, perfil y preferencias de apariencia (tema y acento), con efecto glass en la barra superior y el offcanvas. ([#52](https://github.com/HuitziDomingo/personal-blog/pull/52))
- [x] BLOG-018: Crear vista de gestión y creación de posts (Editor Markdown). ([#50](https://github.com/HuitziDomingo/personal-blog/pull/50), [#51](https://github.com/HuitziDomingo/personal-blog/pull/51))
  - [x] Parte A: lista de posts con filtro por estado, paginación y archivar. ([#50](https://github.com/HuitziDomingo/personal-blog/pull/50))
  - [x] Parte B: crear y editar posts con el editor Markdown. ([#51](https://github.com/HuitziDomingo/personal-blog/pull/51))
- [x] BLOG-065: Paquete `packages/markdown` (ADR-017) con la allowlist, `isSafeUrl` y `renderMarkdown`, variantes de navegador y de servidor (jsdom) con los mismos tests, y el admin migrado. ([#58](https://github.com/HuitziDomingo/personal-blog/pull/58))
- [x] BLOG-068: Paginación de la lista de posts del admin centrada y anclada al final de la página, igual en móvil y escritorio. ([#62](https://github.com/HuitziDomingo/personal-blog/pull/62))
- [x] BLOG-069: Fijar `@types/node` en 24.x (el runtime de `.nvmrc`) en e2e, admin y `packages/markdown`. ([#63](https://github.com/HuitziDomingo/personal-blog/pull/63))
- [x] BLOG-066: Política de links del paquete de Markdown: en la web solo los externos abren en otra pestaña; el admin sigue abriendo todos. ([#53](https://github.com/HuitziDomingo/personal-blog/pull/53))
- [x] BLOG-067: `ng serve` (y con él `make admin-dev` y `make e2e`) no resolvía los imports sin extensión de `packages/markdown` al pre-empaquetar dependencias. ([#53](https://github.com/HuitziDomingo/personal-blog/pull/53))
- [x] BLOG-036: Sanitizar el Markdown de los posts al renderizar en `apps/web` y `apps/admin`, con allowlist (ADR-010). ([#58](https://github.com/HuitziDomingo/personal-blog/pull/58), [#53](https://github.com/HuitziDomingo/personal-blog/pull/53))
- [x] BLOG-070: Editor WYSIWYG del admin con Milkdown Crepe (ADR-018), sin cambiar la interfaz `value`/`valueChange`. ([#64](https://github.com/HuitziDomingo/personal-blog/pull/64))
- [x] BLOG-046: CSP y cabeceras del admin en Vercel (ADR-012). ([#45](https://github.com/HuitziDomingo/personal-blog/pull/45))
- [ ] BLOG-047: Configurar admin.huitzi.xyz en Vercel y DNS en DreamHost. El build command de Vercel debe ser el script `build` del paquete (`pnpm --filter @personal-blog/admin build`), que corre el chequeo de la URL de la API, no `ng build` directo.
- [x] BLOG-050: Activar security.autoCsp en angular.json (va con BLOG-046). ([#45](https://github.com/HuitziDomingo/personal-blog/pull/45))
- [x] BLOG-057: Chequeo posterior al build del `<meta>` de CSP de autoCsp, `make admin-preview` que siempre reconstruye y prueba de la CSP en un navegador headless. ([#46](https://github.com/HuitziDomingo/personal-blog/pull/46))
- [x] BLOG-058: Correr la prueba de la CSP del admin en un navegador headless (`check-csp-browser.mjs`) en el job admin del CI. ([#48](https://github.com/HuitziDomingo/personal-blog/pull/48))
- [x] BLOG-051: API_BASE_URL del admin desde la configuración de build, no fijo en localhost (antes de BLOG-047). ([#41](https://github.com/HuitziDomingo/personal-blog/pull/41))
- [x] BLOG-062: Debounce de 150 ms en la vista previa del editor de Markdown, sin retrasar el valor del formulario. ([#55](https://github.com/HuitziDomingo/personal-blog/pull/55))
- [x] BLOG-085: Footer de la web siempre al fondo en páginas cortas (404, blog vacío, error): `body` en columna con `min-height: 100dvh` y el `<main>` con `flex: 1`. ([#79](https://github.com/HuitziDomingo/personal-blog/pull/79))

## Fase 4: Testing & CI/CD Pipeline

- [ ] BLOG-019: Implementar pruebas unitarias en Go para servicios y handlers (`testify` + mocks).
- [ ] BLOG-020: Implementar pruebas unitarias de componentes/servicios en Angular (`Vitest`).
- [x] BLOG-061: E2E con Playwright del flujo crítico de ADR-006 (login, borrador, edición, publicación, API pública y archivo), más contraseña incorrecta y logout, con `make e2e` contra el stack local en una base temporal. ([#56](https://github.com/HuitziDomingo/personal-blog/pull/56))
- [x] BLOG-021: Job admin en ci.yml (ADR-014). ([#34](https://github.com/HuitziDomingo/personal-blog/pull/34))
- [x] BLOG-052: Job web en ci.yml con su filtro en el job changes, cuando exista `apps/web` (ADR-014). ([#53](https://github.com/HuitziDomingo/personal-blog/pull/53))
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

- [x] BLOG-059: Crear `apps/web` (Next.js, ADR-017): TypeScript estricto, ISR, CSP y `packages/markdown` en el servidor. ([#53](https://github.com/HuitziDomingo/personal-blog/pull/53))
- [x] BLOG-075: `apps/web` como sitio real: portafolio con el contenido de la web anterior, blog con vista de lectura, modo claro/oscuro/sistema, SEO (canónicas, Open Graph, sitemap, robots y RSS) e imágenes con `next/image`. ([#70](https://github.com/HuitziDomingo/personal-blog/pull/70))
- [ ] BLOG-076: Crear en el admin los 2 posts de la web anterior (`docs/web/posts-migrados/`), con los slugs `arreglos` y `backend-api`.
- [ ] BLOG-077: Decidir los pendientes del inventario de la web anterior: perro 3D (three.js), íconos de marca de las redes, resaltado de sintaxis del código y animaciones de entrada.
  - Perro 3D: descartado por licencia. El `dog.glb` de la web anterior es el modelo de craftzdog (Takuya Matsuyama), bajo CC BY-NC-ND 4.0, y su README pide no usarlo. Un modelo propio sería una tarea aparte, si se decide.
- [ ] BLOG-078: Paginación en `/blog`: hoy muestra los 20 posts más recientes y el resto solo se alcanza desde el sitemap.
- [ ] BLOG-083: Aplicar Trusted Types en el admin requiere políticas para `vue` y `dompurify` por Milkdown (ADR-018): Vue crea la suya, Crepe trae una segunda instancia de DOMPurify y asigna `innerHTML` a sus íconos. Hoy queda en Report-Only.

## Fase futura (fuera del MVP)

- [x] BLOG-071: Servidor MCP de solo lectura por stdio (ADR-019): `internal/mcp` y `cmd/mcp`, con búsqueda por texto en `service`. ([#65](https://github.com/HuitziDomingo/personal-blog/pull/65))
- [x] BLOG-074: Línea Estado de ADR-002 y ADR-006: complementados por ADR-019. ([#68](https://github.com/HuitziDomingo/personal-blog/pull/68))
- [x] BLOG-079: ADR-021: asistente de escritura con IA (v1) como workflow sobre un puerto de proveedor, con Gemini en su plan gratuito. ([#71](https://github.com/HuitziDomingo/personal-blog/pull/71))
- [x] BLOG-080: Backend del asistente de escritura (ADR-021): mejorar la redacción y sugerir metadatos, con puerto en `domain`/`service`, adaptador de Gemini y fake, bucket propio por usuario y `ASSISTANT_ENABLED`. ([#75](https://github.com/HuitziDomingo/personal-blog/pull/75))
- [ ] BLOG-081: Adaptador HTTP de `WritingAssistant` en el admin, contra las operaciones del asistente de la API (ADR-021).
- [ ] BLOG-023: Definir `domain/comment.go` e implementar comentarios.
- [ ] BLOG-024: Crear vista de moderación de comentarios.
- [ ] BLOG-025: Agregar `AIModeration` a la moderación de comentarios.
- [ ] BLOG-026: Agregar `AgentSummary` a los posts.
