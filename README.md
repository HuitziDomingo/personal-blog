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

- **API:** autenticación con cookies `HttpOnly` (login, refresh, logout y `/auth/me`), línea base de seguridad de ADR-010, y repositorio y service de posts con sus reglas de negocio. Los endpoints de posts están en curso; hoy responden 501.
- **Admin:** proyecto Angular con sesión, guard de rutas e interceptores de credenciales y refresh. Falta el layout y el editor de posts.
- **Web:** pendiente.
- **Despliegue:** pendiente; nada está en producción.

El detalle de cada tarea está en el [roadmap](docs/roadmap.md).

## Cómo empezar

Prerrequisitos, primer arranque, comandos y tests: [docs/development.md](docs/development.md).

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
