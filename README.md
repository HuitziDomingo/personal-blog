# personal-blog

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`.

## Estructura

Monorepo según el [ADR-001](docs/adr/001-stack-y-monorepo.md):

```text
personal-blog/
├── apps/
│   └── admin/          # Dashboard: Angular + Spartan UI + Tailwind CSS
├── packages/
│   └── api-types/      # Tipos TypeScript generados del contrato
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

`apps/web`, el blog público en Next.js para Vercel, todavía no existe.

## Estado

- **API:** autenticación con cookies `HttpOnly` (login, refresh, logout y `/auth/me`), línea base de seguridad de ADR-010, y CRUD de posts: API pública de posts publicados y endpoints de admin para crear, editar, publicar y archivar.
- **Admin:** proyecto Angular con sesión, guard de rutas e interceptores de credenciales y refresh, lista de posts en `/posts` con filtro por estado, paginación y archivar, y editor de posts (`/posts/new` y `/posts/:id`) con vista previa del Markdown sanitizada. Falta el layout.
- **Web:** pendiente.
- **Despliegue:** pendiente; nada está en producción.

El detalle de cada tarea está en el [roadmap](docs/roadmap.md).

## Cómo empezar

Prerrequisitos, primer arranque, comandos y tests: [docs/development.md](docs/development.md).

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
