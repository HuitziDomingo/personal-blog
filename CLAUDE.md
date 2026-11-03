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

- Instalar dependencias: `pnpm install`
- Levantar entorno local: `cp .env.example .env` y `make db-up`
- Parar MongoDB local: `make db-down` (conserva los datos)
- Ver logs de MongoDB local: `make db-logs`
- Borrar los datos de MongoDB local: `make db-reset` (pide confirmación)
- Levantar la API: `make api-run`
- Tests de Go: `make api-test`
- Tests de integración de Go: `make api-test-integration` (levanta MongoDB con docker compose)
- Tests de front: TODO
- E2E: TODO
- Lint y análisis de Go: `make api-lint`
- Lint y análisis de front: TODO
- Build de la API: `make api-build`
- Generar código del contrato: `make generate`
- Build de front: TODO

## Flujo

- Una rama por PR, creada desde `main`.
- PRs chicos.
- Conventional Commits con scope: `api`, `web`, `admin` o `docs`.
- Nunca hagas push a `main`.
- Si un PR agrega o cambia un comando, actualiza `docs/development.md` en el mismo PR.
- Merge solo con CI verde; el check obligatorio es `ci`. El merge lo hace León, no Claude:

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
- MVP sin transacciones multi-documento: Mongo local es standalone y Atlas es replica set. Si se necesitan, se cambia a replica set de un nodo con un ADR.

## Contrato de API

Ver [ADR-007](docs/adr/007-contrato-api-spec-first-oapi-codegen.md).

- Todo cambio de la API empieza en `docs/api/openapi.yaml`.
- El código en `handler/gen/` nunca se edita a mano.
- `domain` no importa `gen`.
- Los mensajes de error de la API van en inglés; la traducción es responsabilidad de los frontends.

## Seguridad

Ver [ADR-010](docs/adr/010-linea-base-de-seguridad-de-la-api.md).

- Todo endpoint nuevo cumple ADR-010; la descripción del PR incluye cómo.

## Testing

Ver [ADR-003](docs/adr/003-estrategia-global-de-testing.md) y [ADR-006](docs/adr/006-correcciones-a-adr-002-y-003.md).

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
- Al empezar cada tarea, marca en su rama las tareas cuyo PR ya está mergeado en main, con el link del PR.

## Obsidian

- Consulta la especificación antes de implementar.
- Si Obsidian contradice un ADR mergeado, gana el ADR y avisa a León.

## Límites

- No toques GCP, Vercel, Atlas, DNS, secretos ni producción.
- Nada de credenciales en el código.

## Modo aprendizaje Go

En la descripción del PR, explica el porqué de los patrones de Go no obvios. Explícalo ahí, no en comentarios del código.
