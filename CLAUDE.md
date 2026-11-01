# CLAUDE.md

CMS y blog técnico sobre orquestación de agentes de IA para `huitzi.xyz`. León está aprendiendo Go con este proyecto.

El repo es la fuente de verdad del código, las decisiones y el backlog (`docs/roadmap.md`). Obsidian lo es de la especificación. Las decisiones están en `docs/adr/`: este archivo remite a ellas y no las sustituye.

## Proyecto y estructura

Ver [ADR-001](docs/adr/001-stack-y-monorepo.md).

- `apps/web`: Next.js, desplegado en Vercel.
- `apps/admin`: Angular + Spartan UI + Tailwind.
- `services/api`: Go + Gin.
- `docs/`: documentación técnica, ADRs y contratos de API.

## Comandos

No inventes comandos. Cuando exista uno real, sustituye su TODO.

- Instalar dependencias: TODO
- Levantar entorno local: TODO
- Levantar la API: `make api-run`
- Tests de Go: `make api-test`
- Tests de front: TODO
- E2E: TODO
- Lint y análisis de Go: `make api-lint`
- Lint y análisis de front: TODO
- Build de la API: `make api-build`
- Build de front: TODO

## Flujo

- Una rama por PR, creada desde `main`.
- PRs chicos.
- Conventional Commits con scope: `api`, `web`, `admin` o `docs`.
- Nunca hagas push a `main`.
- Merge solo con CI verde. El merge lo hace León, no Claude:

  ```sh
  gh pr checks --watch && gh pr merge --squash --delete-branch
  ```

## Go / hexagonal

Ver [ADR-002](docs/adr/002-arquitectura-backend-y-autenticacion.md) y [ADR-006](docs/adr/006-correcciones-a-adr-002-y-003.md).

- Las dependencias apuntan hacia adentro: `handler → service → domain ← repository`.
- `domain` no importa gin ni mongo, ni usa tags de transporte de `encoding/json`.
- Los DTOs HTTP viven en `handler`.
- Envuelve los errores con `%w`.
- Sin `panic` en el servidor.
- `context.Context` es el primer parámetro en toda función con I/O.
- `gofmt`, `go vet`, `golangci-lint` y `govulncheck` deben quedar en verde.
- Driver de Mongo: `go.mongodb.org/mongo-driver/v2`.
- Los índices de Mongo se crean de forma idempotente.

## Testing

Ver [ADR-003](docs/adr/003-estrategia-global-de-testing.md).

- Go: `testify` + `mockery`.
- Front: Vitest + Testing Library.
- Flujo crítico: Playwright.
- Todo endpoint nuevo lleva test.

## Dependencias

- Toda dependencia nueva, de Go o npm, se justifica en el PR.
- Si no está en un ADR, pregunta antes de añadirla.

## ADRs

- Ruta: `docs/adr/NNN-titulo.md`.
- Secciones: Contexto, Alternativas consideradas, Decisión y Consecuencias.
- Decisión nueva = ADR nuevo.
- Los ADRs aprobados en main son inmutables. Solo se edita la línea Estado. Las correcciones van en un ADR nuevo que indica a cuál reemplaza, y el anterior se marca como reemplazado.
- Si una tarea contradice un ADR, detente y pregunta a León.

## Backlog

Ubicación: [docs/roadmap.md](docs/roadmap.md).

- Cada PR referencia el ID de la tarea.
- Marca una tarea con `[x]` SOLO cuando su PR esté mergeado a `main`, y pon el link del PR al lado. Nunca por CI verde ni por PR abierto.

## Obsidian

- Consulta la especificación antes de implementar.
- Si Obsidian contradice un ADR mergeado, gana el ADR y avisa a León.

## Límites

- No toques GCP, Vercel, Atlas, DNS, secretos ni producción.
- Nada de credenciales en el código.

## Modo aprendizaje Go

En la descripción del PR, explica el porqué de los patrones de Go no obvios. Explícalo ahí, no en comentarios del código.
