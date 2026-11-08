# personal-blog

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`.

## Estructura

Monorepo según el [ADR-001](docs/adr/001-stack-y-monorepo.md):

```text
personal-blog/
├── apps/
│   └── admin/          # Dashboard: Angular + Spartan UI + Tailwind CSS
├── packages/
│   ├── api-types/      # Tipos TypeScript generados del contrato
│   └── markdown/       # Render y sanitización de Markdown (admin y web)
├── e2e/                # E2E con Playwright del flujo crítico (make e2e)
├── services/
│   └── api/            # API: Go + Gin + MongoDB
├── docs/
│   ├── adr/            # Decisiones de arquitectura
│   ├── api/            # Contrato OpenAPI y colección de Bruno
│   ├── development.md  # Guía de desarrollo
│   └── roadmap.md      # Backlog
├── scripts/            # Scripts de generación
├── docker-compose.yml  # MongoDB local
└── Makefile            # Comandos del proyecto
```

`apps/web` es el blog público en Next.js para Vercel ([ADR-017](docs/adr/017-arquitectura-de-la-web-publica-nextjs.md)), todavía sin desplegar.

## Estado

- **API:** autenticación con cookies `HttpOnly` (login, refresh, logout y `/auth/me`), línea base de seguridad de ADR-010, y CRUD de posts: API pública de posts publicados y endpoints de admin para crear, editar, publicar y archivar. Además, un servidor MCP de solo lectura por stdio (ADR-019), sin conectar a ningún cliente.
- **Admin:** proyecto Angular con sesión, guard de rutas e interceptores de credenciales y refresh, lista de posts en `/posts` con filtro por estado, paginación y archivar, editor de posts (`/posts/new` y `/posts/:id`) con vista previa del Markdown sanitizada, y layout con menú lateral u offcanvas, tema claro, oscuro o del sistema y color de acento.
- **E2E:** Playwright con el flujo crítico de ADR-006 (login, borrador, edición, publicación, API pública y archivo), la contraseña incorrecta y el logout, con `make e2e` contra el stack local en una base temporal. Todavía no corre en el CI.
- **Web:** Next.js con TypeScript estricto (ADR-017): lista de posts e ISR de 60 s, cada post con su Markdown sanitizado en el servidor, CSP y cabeceras, y job `web` en el CI. Sin desplegar todavía.
- **Despliegue:** pendiente; nada está en producción.

El detalle de cada tarea está en el [roadmap](docs/roadmap.md).

## Cómo empezar

Prerrequisitos, primer arranque, comandos y tests: [docs/development.md](docs/development.md).

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
