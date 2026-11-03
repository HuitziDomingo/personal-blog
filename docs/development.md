# Guía de desarrollo

Cómo levantar y probar el proyecto en local. Las decisiones están en [docs/adr](adr/) y el backlog en [roadmap.md](roadmap.md).

## Prerrequisitos

| Herramienta | Versión | Dónde está fijada |
| --- | --- | --- |
| Node.js | 24 | `.nvmrc` y `package.json` |
| pnpm | 10.20.0 | `packageManager` en `package.json`; se activa con `corepack enable` |
| Go | 1.27 (toolchain 1.27.3) | `services/api/go.mod` |
| Docker | Con Docker Compose v2 | No está fijada |
| golangci-lint | v2.15 | `ci.yml`; solo para `make api-lint` |

## Estructura

```text
personal-blog/
├── apps/                 # Pendiente: web (Next.js) y admin (Angular)
├── packages/
│   └── api-types/        # Tipos TypeScript generados del contrato
├── services/
│   └── api/              # API en Go + Gin
│       ├── cmd/api/      # Punto de entrada
│       └── internal/
│           ├── config/       # Variables de entorno
│           ├── domain/       # Entidades, puertos y errores
│           ├── handler/      # HTTP; handler/gen es código generado
│           ├── repository/   # Implementación en MongoDB
│           └── service/      # Casos de uso
├── docs/
│   ├── adr/              # Decisiones de arquitectura
│   ├── api/openapi.yaml  # Contrato de API
│   └── roadmap.md        # Backlog
├── docker-compose.yml    # MongoDB local
└── Makefile              # Comandos del proyecto
```

## Primer arranque

1. Instala las dependencias de Node:

   ```sh
   nvm use
   corepack enable
   pnpm install
   ```

2. Crea tu configuración local. `.env` no se sube a git:

   ```sh
   cp .env.example .env
   ```

3. Levanta MongoDB:

   ```sh
   make db-up
   ```

4. Levanta la API, que escucha en el puerto 8080:

   ```sh
   make api-run
   ```

5. En otra terminal, comprueba que responde:

   ```sh
   curl localhost:8080/ready
   ```

   Debe devolver `{"status":"ready"}`.

Sin `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`, la API registra un warning y funciona sin administrador. Para crearlo, define ambas en `.env` antes de arrancar con la colección `users` vacía. La contraseña va de 12 caracteres a 72 bytes.

## Comandos del Makefile

| Comando | Qué hace |
| --- | --- |
| `make api-run` | Carga `.env` y levanta la API |
| `make api-test` | Corre los tests de Go con `-race`; los de integración se saltan |
| `make api-test-integration` | Levanta MongoDB y corre los tests de `internal/repository` contra él |
| `make api-lint` | Corre `golangci-lint` |
| `make api-build` | Compila el binario en `services/api/bin/api` |
| `make api-docker-build` | Construye la imagen `personal-blog-api` |
| `make generate` | Regenera el código y los tipos del contrato |
| `make db-up` | Levanta MongoDB y espera a que esté sano |
| `make db-down` | Para MongoDB y conserva los datos |
| `make db-logs` | Sigue los logs de MongoDB |
| `make db-reset` | **Borra los datos de MongoDB**; pide escribir `borrar` |

## Tests y lint

Tests unitarios, sin dependencias externas:

```sh
make api-test
```

Tests de integración. Usan el `MONGO_URI` de `.env`, crean una base `test_<id>` por test y la borran al terminar, así que no tocan `personal_blog`:

```sh
make api-test-integration
```

Lint. Requiere `golangci-lint` instalado:

```sh
make api-lint
```

Sin instalarlo, y también para `govulncheck`, desde `services/api`:

```sh
go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
```

## Regenerar el contrato

Todo cambio de la API empieza en `docs/api/openapi.yaml` ([ADR-007](adr/007-contrato-api-spec-first-oapi-codegen.md)).

1. Edita `docs/api/openapi.yaml`.
2. Ejecuta `make generate`, que actualiza `services/api/internal/handler/gen/` y `packages/api-types/`.
3. Sube los archivos generados junto con el spec. CI falla si difieren.

El código generado nunca se edita a mano.

## Frontends

Pendiente. `apps/web` y `apps/admin` todavía no existen.

## Troubleshooting

### MongoDB no arranca: `Linux kernel versions 6.19 and newer`

MongoDB 8.x se niega a arrancar en kernels 6.19 a 7.0.13 ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). `make db-up` falla, y `make db-logs` muestra el error.

La solución oficial es usar un kernel 7.0.14 o posterior. Comprueba el que usa Docker con:

```sh
docker info --format '{{.KernelVersion}}'
```

En CI, por este motivo, el job `api` usa `ubuntu-22.04`; ni `ubuntu-latest` ni `ubuntu-24.04` funcionan (BLOG-033).

### Falla la autenticación contra MongoDB

`MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD` solo se aplican cuando el volumen está vacío. Cambiarlas después en `.env` no cambia el usuario que ya existe, y la API deja de autenticarse.

Tienes dos opciones:

- Volver a poner en `.env` los valores originales.
- Ejecutar `make db-reset`, que **borra todos los datos locales**, y después `make db-up`.

`MONGO_URI` debe llevar la misma contraseña, URL-encoded.

### Un valor de `.env` con `$` queda cortado

`make api-run` carga `.env` con `. ./.env`, así que el shell expande `$` en valores sin comillas o con comillas dobles, y `#` o los espacios también pueden romper un valor. Usa comillas simples:

```sh
INITIAL_ADMIN_PASSWORD='pa$$word with spaces'
```
