# personal-blog

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`.

## Estructura

Estructura planeada según el [ADR-001](docs/adr/001-stack-y-monorepo.md). Por ahora solo existe `docs/`.

```text
personal-blog/
├── apps/
│   ├── web/        # Blog público: Next.js en Vercel
│   └── admin/      # Dashboard: Angular + Spartan UI + Tailwind CSS
├── services/
│   └── api/        # API: Go + Gin
└── docs/           # Documentación técnica, ADRs y contratos de API
```

## Decisiones

Las decisiones de arquitectura están en [docs/adr](docs/adr/).
