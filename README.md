# personal-blog

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`.

## Estructura

Estructura planeada según el [ADR-001](docs/adr/001-stack-y-monorepo.md). `apps/` todavía no existe.

```text
personal-blog/
├── apps/
│   ├── web/        # Blog público: Next.js en Vercel
│   └── admin/      # Dashboard: Angular + Spartan UI + Tailwind CSS
├── services/
│   └── api/        # API: Go + Gin
└── docs/           # Documentación técnica, ADRs y contratos de API
```

## Desarrollo

Cómo levantar y probar el proyecto: [docs/development.md](docs/development.md).

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
